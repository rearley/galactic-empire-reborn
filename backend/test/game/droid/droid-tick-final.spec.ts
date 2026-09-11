/**
 * Round four — the last decisions open in `DroidTickService`, ahead of the
 * restructuring work. Three things, none of them reachable from the four files
 * that came before:
 *
 *   1. HOW SOON A DROID THINKS AGAIN. `actOnDroid` re-arms the countdown with
 *      `nextDroidTick(detected || droid.cantexit > 0 ? 1 : 0, …)`. That ternary
 *      is the AI's reaction rate and nothing else in the suite reads it at the
 *      SERVICE level — `droid-cadence.spec.ts` drives the helper with hand-
 *      chosen arguments, which is exactly the shape docs/TEST_STRATEGY.md warns
 *      about ("test the caller's arithmetic, not the function's"). A helper
 *      test cannot tell you whether a drone that just spotted a player is
 *      handed 1 or 0.
 *
 *   2. WHO A DROID IS ALLOWED TO SEE. `runDroidActions` filters the player list
 *      down to `status === GESTAT_USER` ships that are NOT standing in sector
 *      (0,0). Nothing pinned that exclusion, and it is the rule that makes the
 *      neutral zone safe to sit in.
 *
 *   3. THE TWO ZERO-DAMAGE GATES, and the blown shield. `firePhaser` refuses to
 *      apply anything below one point of damage, `fireHyperPhaser` does the
 *      same, and the SHIELDUP arm of `firePhaser` can blow a nearly-flat shield
 *      into SHIELDDM. Round one only ever fired at point-blank range into a
 *      healthy charge, so all three were unentered.
 *
 * Canon: GEDROIDS.C:214-227 (`droid_lives`' energy reset and tick re-arm),
 * GEDROIDS.C:434-442 (the shorter tick, and the shields, a Vakory takes on
 * spotting someone),
 * GECMDS.C:975-1000 (`firep`'s consequence block), GECMDS.C:1042-1087
 * (`firehp`), GEFUNCS.C:2443-2462 (`shieldhit`, and the blow into SHIELDDM).
 *
 * Randomness is a fixed 0.99 draw throughout, so every roll is arithmetic
 * rather than draw order: `rollAnnoy(4)` is floor(0.99*4)=3 ≠ 1 (no chatter),
 * `alterVectorDenom` is floor(0.99*20)=19 ≠ 1 (no vector scramble), and
 * `nextDroidTick`'s `gernd()%CYBTICKTIME` is floor(0.99*6)=5.
 *
 * DELIBERATELY NOT TESTED, confirmed dead from every entry point rather than
 * merely untried — recorded so the next round does not re-open them:
 *   - `layMine`'s `mineCount <= 0` hold and `deployJammer`'s `jamCount <= 0`
 *     hold. `droidActClass12` computes `layMine`/`deployJammer` from those same
 *     two item counts (droid-act-class-12.ts:135-136) and `actClass12` calls
 *     the helpers only when the flag is set, so neither helper is ever entered
 *     with an empty magazine. Both helpers have exactly one caller.
 *   - The `false` arm of `lineOfFire` in `firePhaser` and of `withinArc` in
 *     `fireHyperPhaser`. Both are handed `bearing`, which the same function
 *     computed FROM the target's position two lines earlier, so the firing
 *     direction and the direction to the victim are the same number: the arc
 *     test can only fail on `dx === 0 && dy === 0`, a droid occupying the
 *     target's exact floating-point coordinates. The tests are vestigial as
 *     written; they would come alive again only if a caller ever passed a
 *     bearing it did not derive from the victim.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Random } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import {
  ShipClassCacheService,
  type ShipClassEntry,
} from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind, type TickContext } from '../../../src/game/tick/tick.types';
import { hyperPhaserDamage, phaserDamage } from '../../../src/game/combat/combat-math';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { shipKey } from '../../../src/game/ship/ship-state.types';
import {
  CYBTICKTIME,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  FIRETICKS,
  GESTAT_AUTO,
  GESTAT_USER,
  SHIELDDM,
} from '../../../src/game/constants';
import { makeShip as buildShip } from '../../helpers/make-ship';

/** Canon's Vakory scanner: `S33SRNG {Scan Range: 25000}` (GE/REL/MBMGESHP.MSG). */
const SCAN_RANGE = 25_000;

/** One sector in the raw units every range constant is stored in. */
const SECTOR = 10_000;

/** The constant draw every case below runs on. */
const DRAW = 0.99;

/** `gernd()%CYBTICKTIME` under that draw. @see GEDROIDS.C:221,225 */
const ROLL = Math.floor(DRAW * CYBTICKTIME);

// Local defaults layered on the shared factory: this suite's victim has
// never been fired on (`lastfired: -1`), a full weapons rack of empty slots
// (channel 255), and a Vakory-scale topspeed (4 = warp 4).
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return buildShip({
    userid: 'p1',
    shipname: 'Victim',
    energy: 50000,
    phasr: 100,
    phasrtype: 1,
    lastfired: -1,
    shieldtype: 2,
    shield: 100,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    freq: [],
    items: new Array(14).fill(0n) as bigint[],
    status: GESTAT_USER,
    cybmine: 255,
    topspeed: 4,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  });
}

const CLASS_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: SCAN_RANGE, maxTons: 100, hasTorpedo: true, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false,
  noClaim: 0, tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100, typeName: 'Vakory Survey Drone',
  category: 'CPU_DROID', shipNameTemplate: '',
} as unknown as ShipClassEntry;

interface Harness {
  svc: DroidTickService;
  ships: Map<string, ShipState>;
  /** Fire the real 1-second AI tick `onModuleInit` subscribed. */
  tick: () => void;
}

/**
 * Everything is real except the ship table, the class cache and the mine
 * plumbing: the service, `DroidSpawner` (whose `isFrozen` genuinely returns
 * false for a ship the debug endpoint never registered) and the whole class-12
 * decision tree all run as they do in production.
 */
function buildHarness(seed: readonly ShipState[]): Harness {
  const random = { next: () => DRAW } as unknown as Random;
  const events = new EventEmitter2();
  const ships = new Map<string, ShipState>();
  for (const s of seed) ships.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(ships.values()),
    get: (u: string, n: number) => ships.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = ships.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => ships.set(shipKey(s.userid, s.shipno), s),
    removeFromGame: (r: { userid: string; shipno: number }) =>
      ships.delete(shipKey(r.userid, r.shipno)),
    size: () => ships.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: () => CLASS_ENTRY,
    getMaxPhaser: () => 1,
    getMaxTons: () => 100,
    getMaxShields: () => 1,
    getScanRange: () => SCAN_RANGE,
  } as unknown as ShipClassCacheService;

  const subs: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      if (kind === TickKind.SHIP_UPDATE) subs.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new DroidTickService(
    tickService, shipState, classCache,
    new DroidSpawner(shipState, classCache, random),
    { add: () => {}, hydrate: () => {} } as unknown as MineRegistry,
    { create: () => Promise.resolve({ id: 1 }) } as unknown as MineRepository,
    events, random,
  );
  void svc.onModuleInit();

  return {
    svc, ships,
    tick: () => {
      for (const fn of subs) {
        fn({ kind: TickKind.SHIP_UPDATE, tickNumber: 1, firedAt: new Date() });
      }
    },
  };
}

/** A Vakory the tick will actually reach: in the population, countdown at zero. */
function seatVakory(svc: DroidTickService, droid: ShipState): void {
  svc.getLivePopulation().get(DROID_CLASS_VAKORY)!.add(droid.userid);
}

function makeVakory(over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 1, shipname: 'Vakory',
    shpclass: DROID_CLASS_VAKORY, status: GESTAT_AUTO, isEphemeral: true,
    topspeed: 4, tick: 0, energy: 1,
    ...over,
  });
}

function act12(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass12: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass12(droid, players, SCAN_RANGE, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. How soon the droid thinks again
// ═══════════════════════════════════════════════════════════════════════════

describe('how soon a Droid thinks again (GEDROIDS.C:214-227, 434-442)', () => {
  /**
   * Canon re-arms the countdown at the end of `droid_lives`:
   *
   *   if (ptr->tick == 255) {
   *     if (ptr->cantexit == 0) ptr->tick = (CYBTICKTIME + gernd()%CYBTICKTIME)*3;
   *     else                    ptr->tick =  CYBTICKTIME + gernd()%CYBTICKTIME;
   *   }
   *
   * GEDROIDS.C:216-227 — and the class actions themselves short-circuit that
   * sentinel by writing the SHORT value the moment a player comes into scanner
   * range (GEDROIDS.C:442, and its class-10 twin at GEDROIDS.C:278). This
   * port folds both into one expression,
   * `nextDroidTick(detected || cantexit > 0 ? 1 : 0, …)`, so the ternary
   * carries canon's whole reaction-rate rule.
   *
   * This is what makes engaging a drone feel different from passing one: a
   * cruising Vakory re-decides every 33 seconds, one that has seen you or been
   * shot at every 11. Get it wrong in either direction and either the drone
   * becomes a statue that never returns fire in time, or the whole population
   * turns three times as aggressive as canon.
   *
   * These go through the real 1-second tick — `onAiTick` → `runDroidActions` →
   * `actOnDroid` — not through the helper.
   */
  const CRUISING = (CYBTICKTIME + ROLL) * 3;
  const ALERT = CYBTICKTIME + ROLL;

  /**
   * Breaks if: the `* 3` cruising multiplier is dropped, or the ternary starts
   * reporting a droid with nobody in range as alert.
   */
  it('with nobody in scanner range and no battle lock, it waits the long count', () => {
    const droid = makeVakory({ xcoord: 5, ycoord: 5, cantexit: 0, lastfired: -1 });
    const faraway = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 50, ycoord: 50 });
    const h = buildHarness([droid, faraway]);
    seatVakory(h.svc, droid);

    h.tick();

    expect(droid.tick).toBe(CRUISING);
    // Proof the tick actually reached actOnDroid rather than skipping it.
    expect(droid.energy).toBe(50_000);
    expect(droid.dirty).toBe(true);
  });

  /**
   * Breaks if: `detected` is dropped from the disjunction, or `actClass12`
   * stops returning it (the return value is otherwise unread, which is exactly
   * how a refactor loses it silently).
   */
  it('spotting a player shortens it, with no shot fired and no battle lock', () => {
    const droid = makeVakory({ xcoord: 5, ycoord: 5, cantexit: 0, lastfired: -1, shieldstat: 0 });
    const player = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 5.5, ycoord: 5 });
    const h = buildHarness([droid, player]);
    seatVakory(h.svc, droid);

    h.tick();

    expect(droid.tick).toBe(ALERT);
    // Detection also raises the shields below warp (GEDROIDS.C:436-439) — the
    // second observable that says the scan loop ran.
    expect(droid.shieldstat).toBe(1);
    // Seen is not shot at: nothing was fired and the player is not battle-locked.
    expect(player.damage).toBe(0);
    expect(player.cantexit).toBe(0);
    expect(droid.phasr).toBe(100);
  });

  /**
   * Breaks if: the `|| droid.cantexit > 0` operand is dropped. Nobody is within
   * scanner range here, so `detected` is false and the battle lock is the only
   * thing that can shorten the count — which is canon's point, that a droid
   * being shot at from beyond its own scanner still reacts fast.
   */
  it('a battle lock alone shortens it, with nobody in range at all', () => {
    const droid = makeVakory({ xcoord: 5, ycoord: 5, cantexit: 3, lastfired: -1 });
    const faraway = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 50, ycoord: 50 });
    const h = buildHarness([droid, faraway]);
    seatVakory(h.svc, droid);

    h.tick();

    expect(droid.tick).toBe(ALERT);
    expect(droid.cantexit).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Who a Droid is allowed to see
// ═══════════════════════════════════════════════════════════════════════════

describe('a player standing in sector (0,0) is invisible to the Droid tick', () => {
  /**
   * CHARACTERIZATION — this is the port's own rule, not canon's.
   * `droid_act_class_12` filters on `ingegame(zothusn) && wptr->status ==
   * GESTAT_USER` and nothing else (GEDROIDS.C:430); the sector-(0,0) exclusion
   * in `runDroidActions` is ours, and it is what makes the neutral zone at the
   * origin a place a new pilot can sit without being hunted.
   *
   * The two cases are the same geometry twice, moved one sector: the droid sits
   * at (0.9, 0.9) and the player is 0.57 sectors away in the first and 0.85 in
   * the second, both comfortably inside a 25000 scanner. The only difference is
   * which sector the player's coordinates FLOOR into, which is precisely the
   * predicate under test — so range cannot be what separates the outcomes.
   *
   * Breaks if: the `Math.floor` pair is removed, changed to a different
   * rounding (`Math.trunc` agrees here, but `Math.round` would not), or the
   * exclusion is inverted.
   */
  it('is not seen: the droid still runs, and still takes the long count', () => {
    const droid = makeVakory({ xcoord: 0.9, ycoord: 0.9, shieldstat: 0 });
    const inZone = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 0.5, ycoord: 0.5 });
    const h = buildHarness([droid, inZone]);
    seatVakory(h.svc, droid);

    h.tick();

    // `onAiTick`'s own player gate does NOT carry the sector exclusion, so the
    // tick runs at all: the energy reset proves actOnDroid was reached.
    expect(droid.energy).toBe(50_000);
    expect(droid.tick).toBe((CYBTICKTIME + ROLL) * 3);
    expect(droid.shieldstat).toBe(0);
  });

  it('one sector out of the zone, the same pilot at a greater range IS seen', () => {
    const droid = makeVakory({ xcoord: 0.9, ycoord: 0.9, shieldstat: 0 });
    const outside = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 1.5, ycoord: 1.5 });
    const h = buildHarness([droid, outside]);
    seatVakory(h.svc, droid);

    h.tick();

    expect(droid.tick).toBe(CYBTICKTIME + ROLL);
    expect(droid.shieldstat).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The zero-damage gates, and the shield that blows
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Vakory that has been shot at: fight-back needs BOTH `cantexit > 0` and
 * `lastfired` pointing at the attacker's CHANNEL (GEDROIDS.C:447).
 */
function shotAtVakory(over: Partial<ShipState> = {}): ShipState {
  return makeVakory({ cantexit: 5, lastfired: 2, tick: 0, energy: 50_000, ...over });
}

describe('a shot that computes to less than one point of damage', () => {
  /**
   * `firep` wraps its ENTIRE consequence block in `if (damage >= 1)`
   * (GECMDS.C:975-1000): below one point the victim takes nothing, is not
   * battle-locked, and `randamage` is never rolled. That gate is what stops a
   * droid grazing a passing ship for zero from setting `cantexit = FIRETICKS`
   * on it — and the ship tick zeroes `repair` whenever `cantexit > 0`, so
   * without it a damaged pilot anywhere within a droid's scanner could never
   * finish a repair.
   *
   * Two sectors out with a Mark-1 phaser is inside the 25000 scanner and still
   * rounds to nothing: `dd = 1 - 20000/24000`, and `dd^PFIRDST` is small enough
   * that `trunc(PDAMMAX * dp)` is zero before any scaling. The precondition
   * below states that premise so a retune of PDAMMAX/PFIRDST fails loudly here
   * rather than turning the case vacuous.
   *
   * The gate covers the CONSEQUENCES and nothing else. Canon's
   * `ptr->phasr = 0` sits outside the victim loop (GECMDS.C:1006), so the
   * trigger costs the bank whatever the shot achieved — asserted below. This
   * port skipped that tail until 2026-09-10, which left a droid firing beyond
   * effective range with a permanently hot bank.
   *
   * Breaks if: `if (damage < 1)` is removed — the victim would take a
   * floored-to-zero hit AND pick up `lastfired`/`cantexit`. Breaks the other
   * way if the bank discharge is moved back inside the gate.
   */
  it('leaves the victim untouched and, above all, not battle-locked', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 2.0, ycoord: 0,
      where: 0, shieldstat: 0, shield: 100,
    });
    const droid = shotAtVakory({ xcoord: 0, ycoord: 0, where: 0, phasr: 100 });
    const h = buildHarness([droid, target]);

    // Premise: at this range the Mark-1 beam floors to nothing.
    expect(phaserDamage({
      phasrtype: 1, phasr: 100, distRaw: 2.0 * SECTOR,
      focus: 0, victimMaxTons: 100, victimAtWarp: false,
    })).toBe(0);

    act12(h.svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(target.shield).toBe(100);
    expect(target.shieldstat).toBe(0);
    expect(target.lastfired).toBe(-1);
    expect(target.cantexit).toBe(0);
    // ...but the bank is spent anyway, and the FIRER is not battle-locked:
    // canon gates `ptr->cantexit` (GECMDS.C:977) and not `ptr->phasr`.
    expect(droid.phasr).toBe(0);
    // The gate is confined to the phaser: the torpedo volley that follows it in
    // `actClass12` is outside the guard and still locks a tube (GEDROIDS.C:476-483).
    expect(target.ltorpsChannel[0]).toBe(droid.channel);
  });

  /**
   * The hyper-phaser has NO such gate, and that is the whole difference.
   *
   * `firehp` adds the damage and sets `lastfired`/`cantexit` unconditionally
   * once the target is inside the arc and inside scan range — GECMDS.C:1078-1081
   * tests nothing. So a zero-point hyper graze battle-locks the victim where a
   * zero-point normal shot does not. The port had mirrored `firep`'s gate into
   * this path until 2026-09-10, which made a droid harmless in hyperspace while
   * a Cybertron in the same position was not.
   *
   * The firer's own charge is unconditional in both, but it is FLUX and not the
   * phaser bank: GECMDS.C:1039-1041 debits `ptr->energy` by HPFIRAMT, arms
   * `hypha` and locks the firer, all before the victim search. `ptr->phasr` is
   * never touched by `firehp` at all.
   *
   * 2.2 sectors is inside both the flat 30000 fight-back gate and the Vakory's
   * own 25000 scanner, so nothing upstream refuses the shot.
   *
   * Breaks if: a `damage >= 1` gate is reintroduced here to match the normal
   * phaser, or the flux charge is moved inside the arc test.
   */
  it('battle-locks a victim it grazes for nothing, unlike the normal phaser', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 2.2, ycoord: 0,
      where: 1, shieldstat: 0, shield: 100,
    });
    const droid = shotAtVakory({ xcoord: 0, ycoord: 0, where: 1, phasr: 100 });
    const h = buildHarness([droid, target]);

    expect(2.2 * SECTOR).toBeLessThan(SCAN_RANGE);
    expect(hyperPhaserDamage({
      phasrtype: 1, distRaw: 2.2 * SECTOR, victimMaxTons: 100,
    })).toBe(0);

    act12(h.svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
    // The FLUX is what a hyper-phaser costs, not the phaser bank. `firehp`
    // debits `ptr->energy` and arms `hypha` before it looks for a victim, and
    // never touches `ptr->phasr`. @see GECMDS.C:1039 `ptr->energy -= HPFIRAMT;`
    expect(droid.phasr).toBe(100);
    expect(droid.hypha).toBe(1);
    expect(droid.cantexit).toBe(FIRETICKS);
  });
});

describe('a Droid phaser hit that blows the shield', () => {
  /**
   * `shieldhit` knocks `dmax * damage/100` off the charge and then, if what is
   * left is 2 or less, takes another `knock*3` off it and sets
   * `wptr->shieldstat = SHIELDDM` (GEFUNCS.C:2455-2462). SHIELDDM is not
   * "down" — it is out of action, and `shi up` refuses until it is repaired.
   *
   * Round one only ever fired into a charge of 100, which is knocked down but
   * never blown, so the `outcome === 'damaged'` arm was unentered. It is the
   * expensive one for a player: the difference between finishing a fight with
   * a flat shield they can raise again and finishing it with no shield at all
   * until they can pay for repairs.
   *
   * Point-blank range with a full bank, into a charge of 1, guarantees the
   * blow whatever PDAMMAX is tuned to: any non-zero knock puts the remainder
   * at or below 2.
   *
   * Breaks if: `if (r.outcome === 'damaged') v.shieldstat = SHIELDDM` is
   * dropped (the shield would read as merely up-and-empty), or the SHIELDUP arm
   * starts leaking hull damage.
   */
  it('goes into SHIELDDM, and the hull still takes nothing', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0,
      where: 0, shieldstat: 1, shield: 1, shieldtype: 2,
    });
    const droid = shotAtVakory({ xcoord: 0, ycoord: 0, where: 0, phasr: 100 });
    const h = buildHarness([droid, target]);

    // Premise: at point-blank the beam is worth at least a point.
    expect(phaserDamage({
      phasrtype: 1, phasr: 100, distRaw: 0.1 * SECTOR,
      focus: 0, victimMaxTons: 100, victimAtWarp: false,
    })).toBeGreaterThanOrEqual(1);

    act12(h.svc, droid, [target]);

    expect(target.shieldstat).toBe(SHIELDDM);
    // The SHIELDUP arm never touches the hull, blown or not (GECMDS.C:991-998).
    expect(target.damage).toBe(0);
    // The extra `knock*3` of GEFUNCS.C:2461 drives the charge well negative.
    expect(target.shield).toBeLessThan(0);
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
  });
});
