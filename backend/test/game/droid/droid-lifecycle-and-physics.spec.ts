/**
 * Round two: the bookkeeping either side of a fight.
 *
 * Round one (droid-tick-decisions.spec.ts) pinned what a Droid DOES while it is
 * being shot at. This file pins the two things that surround that:
 *
 *   A) Droid lifecycle — the Murdonian's own fight-back arms that round one did
 *      not reach (hyper-phaser fire, the confuse vector), plus what happens on
 *      the `combat.ship-destroyed` event: who owns the slot afterwards, and
 *      whether the class ever fills it again.
 *
 *   B) Physics — the parts of `moveship` that only exist in the CALLER.
 *      `checkGravity`, `applySectorChangeEffects` and `applyUniverseEdge` are
 *      pure helpers with their own specs; none of those specs proves that a
 *      ship flying through the tick ever reaches them, or that the caller
 *      applies what they return. That is exactly the gap docs/TEST_STRATEGY.md
 *      names: "test the caller's arithmetic, not the function's" — three
 *      defects on 2026-09-09 survived a helper-level test.
 *
 * Canon: GEDROIDS.C `droid_act_class_11` (302-404) and `droid_died`/`droid_won`
 * (534+); GEFUNCS.C `moveship` (617-792) with `gravity` (836-905) and the
 * sector-change block (724-730); GEMAIN.C `warrti2a` (2462-2493) for the
 * 1-second, stride-3 movement cadence and `autortia` (2296-2424) for the droid
 * spawn cadence.
 *
 * Randomness is a constant draw per case, never a seeded generator's order.
 *
 * DELIBERATELY NOT COVERED here, per docs/TEST_STRATEGY.md:
 *   - `x ?? fallback` display/defensive fallbacks: droid-tick 208, 265, 519,
 *     600, 631, 638, 657, 667, 735, 736, 738; physics 626.
 *   - The catch-block log ternary (physics 235) and the equal-key arm of the
 *     sort comparator (physics 223) — composite ship keys are unique.
 *   - The UNIVWRAP arms (physics 473-474, 533-534): `UNIVWRAP` is read once
 *     from GAME_CONFIG at import time and canon ships NO, so the wrap arm is
 *     unreachable in this build; `applyUniverseEdge` already pins both arms.
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
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import {
  PHYSICS_GRAVITY,
  PHYSICS_DESTRUCT_CANCELLED,
  type PhysicsGravityEvent,
} from '../../../src/game/physics/physics-events';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { shipKey } from '../../../src/game/ship/ship-state.types';
import { DroidEvents, type DroidKilledEvent } from '../../../src/game/droid/droid-events';
import type { CombatShipDestroyedEvent } from '../../../src/game/combat/combat-events';
import {
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_MAX_PER_CLASS,
  DROID_SPAWN_TICK_CADENCE,
  DROID_USERID_PREFIX,
  FIRETICKS,
  GESTAT_AUTO,
  GESTAT_USER,
  PLTYPE_PLNT,
  PLTYPE_WORM,
} from '../../../src/game/constants';
import { makeShip as buildShip } from '../../helpers/make-ship';

// ─── shared ship builder ───────────────────────────────────────────────────

// Local defaults layered on the shared factory: this suite's victim has
// never been fired on (`lastfired: -1`), a full weapons rack of empty slots
// (channel 255), and a canon-scale topspeed (8 = warp 8).
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
    topspeed: 8,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A) DROID — the Murdonian's remaining fight-back arms, and the slot ledger
// ═══════════════════════════════════════════════════════════════════════════

/** The Murdonian's canon scanner: `S32SRNG {25000}` (GE/REL/MBMGESHP.MSG). */
const SCAN_RANGE = 25_000;

const CLASS_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 2,
  scanRange: SCAN_RANGE, maxTons: 100, hasTorpedo: true, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false,
  noClaim: 0, tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100, typeName: 'Murdonian Transport',
  category: 'CPU_DROID', shipNameTemplate: '',
} as unknown as ShipClassEntry;

interface DroidHarness {
  svc: DroidTickService;
  events: EventEmitter2;
  /** The live ship table — removals and inserts show up here as state. */
  ships: Map<string, ShipState>;
  killed: DroidKilledEvent[];
  /** Which classes the spawner was asked to fill, in order. */
  spawnRequests: number[];
  tick: (times: number) => void;
}

/**
 * @param spawnable classes the stub spawner is able to place. A class left out
 *   models "no free coordinates" — `DroidSpawner.spawn` returns undefined.
 */
function buildDroidHarness(
  seed: ShipState[],
  draw: number,
  spawnable: readonly number[] = [],
): DroidHarness {
  const random = { next: () => draw } as unknown as Random;
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
    getMaxShields: () => 2,
    getScanRange: () => SCAN_RANGE,
  } as unknown as ShipClassCacheService;

  const spawnRequests: number[] = [];
  let nextId = 100;
  const spawner = {
    isFrozen: () => false,
    unfreeze: () => {},
    spawn: (classNumber: number, pop: Map<number, Set<string>>) => {
      spawnRequests.push(classNumber);
      if (!spawnable.includes(classNumber)) return undefined;
      const userid = `${DROID_USERID_PREFIX}${nextId++}`;
      const state = makeShip({
        userid, shipno: 1, channel: nextId, shipname: 'Spawned',
        shpclass: classNumber, status: GESTAT_AUTO, xcoord: 40, ycoord: 40,
      });
      ships.set(shipKey(userid, 1), state);
      const set = pop.get(classNumber) ?? new Set<string>();
      set.add(userid);
      pop.set(classNumber, set);
      return state;
    },
  } as unknown as DroidSpawner;

  const subs: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      if (kind === TickKind.SHIP_UPDATE) subs.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new DroidTickService(
    tickService, shipState, classCache, spawner,
    { add: () => {}, hydrate: () => {} } as unknown as MineRegistry,
    { create: () => Promise.resolve({ id: 1 }) } as unknown as MineRepository,
    events, random,
  );
  void svc.onModuleInit();

  const killed: DroidKilledEvent[] = [];
  events.on(DroidEvents.KILLED, (e: DroidKilledEvent) => killed.push(e));

  return {
    svc, events, ships, killed, spawnRequests,
    tick: (times: number) => {
      for (let i = 0; i < times; i++) {
        for (const fn of subs) {
          fn({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
        }
      }
    },
  };
}

function act11(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass11: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass11(droid, players, SCAN_RANGE, 1);
}

describe('the Murdonian fights back in hyperspace', () => {
  /**
   * `if (ptr->where == 1 && wptr->where == 1) { if (ddist < 30000) firehp(...) }`
   * — GEDROIDS.C:344-355. Round one pinned the Vakory's copy of this; the
   * Murdonian's own hyper arm was never entered, and it is the class a new
   * player is told to hunt.
   *
   * `firehp` adds straight to the hull (`wptr->damage += damage`,
   * GECMDS.C:1078) and never calls `shieldhit`, so raised shields absorb
   * nothing. A pilot who chases a Murdonian at warp with shields up believes
   * they are covered; canon says the beam lands on the hull.
   *
   * Breaks if: the class-11 dispatch sends `fireMode === 'hyper'` to
   * `firePhaser` instead of `fireHyperPhaser` (the shield would then eat it and
   * `target.damage` stays 0), or the hyper arm is dropped entirely.
   */
  it('a hyper-phaser hit lands on the hull with the shields still up', () => {
    const droid = makeShip({
      userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 1, shipname: 'Murdonian',
      shpclass: DROID_CLASS_TRANSPORT, status: GESTAT_AUTO, where: 1,
      heading: 0, phasr: 100, phasrtype: 1, cantexit: 5, lastfired: 2,
    });
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2,
      xcoord: 1.0, ycoord: 0, where: 1, shieldstat: 1, shield: 100,
    });
    const h = buildDroidHarness([droid, target], 0.99);

    act11(h.svc, droid, [target]);

    expect(target.damage).toBeGreaterThan(0);
    // firehp never touches the charge — the whole point of the branch.
    expect(target.shield).toBe(100);
    expect(target.shieldstat).toBe(1);
    // Battle lock on both sides: this is what blocks `repair` and `x`.
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
    // The hyper-phaser costs FLUX, not the phaser bank. `firehp` debits
    // `ptr->energy` and arms `hypha`; it never touches `ptr->phasr`.
    // @see GECMDS.C:1039 `ptr->energy -= HPFIRAMT;`
    expect(droid.phasr).toBe(100);
    expect(droid.hypha).toBe(1);
    expect(droid.cantexit).toBe(FIRETICKS);
  });
});

describe('the Murdonian confuse vector', () => {
  /**
   * In normal space, after the fire decision, canon rolls a 1-in-10 course
   * change:
   *
   *   if (ptr->holdcourse == 0 && gernd()%10 == 0) {
   *     ptr->speed2b = rndm(10000.0); ptr->head2b = rndm(359.9);
   *     ptr->holdcourse = gernd()%10 + 3; }
   *
   * GEDROIDS.C:371-375. It is what stops a Murdonian being a stationary firing
   * range: the target that keeps sliding out of a phaser arc mid-duel. Round
   * one only ever drew 0.99, which misses the roll, so the applied branch was
   * never entered — only its negative.
   *
   * The attacker sits 4 sectors out, past the 25000 scanner, so nothing fires
   * and nothing in the scan loop can write `speed2b`; the confuse roll is the
   * only thing that can move it.
   *
   * The draw is a constant 0.05: `floor(0.05*10) === 0` lands the roll, and
   * `rollAnnoy(4)` is `floor(0.05*4) === 0 !== 1`, so no chatter interferes.
   *
   * Breaks if: the `if (fb.confuse)` application block is removed, the roll's
   * comparison is flipped, or `rollConfuseHeading`'s scale changes (speed is
   * `rndm(10000)`, not the Vakory's `rndm(5000)`).
   */
  it('a landed roll rewrites heading, speed and hold-course', () => {
    const droid = makeShip({
      userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 1, shipname: 'Murdonian',
      shpclass: DROID_CLASS_TRANSPORT, status: GESTAT_AUTO, where: 0,
      speed: 0, speed2b: 123, head2b: 200, holdcourse: 0,
      cantexit: 5, lastfired: 2,
    });
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 4, ycoord: 0, where: 0,
    });
    const h = buildDroidHarness([droid, target], 0.05);

    act11(h.svc, droid, [target]);

    // rndm(10000.0), rndm(359.9), gernd()%10 + 3 — all off the same 0.05 draw.
    expect(droid.speed2b).toBeCloseTo(500, 6);
    expect(droid.head2b).toBeCloseTo(17.995, 6);
    expect(droid.holdcourse).toBe(3);
    // Out of scanner range: no shot was fired at the price of this manoeuvre.
    expect(target.damage).toBe(0);
    expect(droid.phasr).toBe(100);
  });
});

describe('the kill ledger — combat.ship-destroyed', () => {
  const makeKill = (
    victimUserid: string,
    attackerUserid: string | null,
  ): CombatShipDestroyedEvent => ({
    victimId: `${victimUserid}:1`,
    attackerId: attackerUserid ? `${attackerUserid}:1` : null,
    victimShipKey: `${victimUserid}:1`,
    attackerShipKey: attackerUserid ? `${attackerUserid}:1` : null,
    victimUserid,
    attackerUserid,
    attackerChannel: 2,
    weapon: 'phaser',
    sector: { x: 5, y: 5 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 50,
  });

  /**
   * `droid_won` — GEDROIDS.C:534: a Droid that has just killed something rolls
   * a fresh drift speed, `ptr->speed2b = rndm(5000.0)`, and wanders off rather
   * than sitting on the wreck.
   *
   * A Droid frozen on the kill site is a Droid parked over the debris the
   * player wants to recover, still shooting anything that comes to collect it.
   *
   * Breaks if: the `attackerUserid.startsWith(DROID_USERID_PREFIX)` dispatch is
   * dropped, or the roll's ceiling changes.
   */
  it('a Droid that scores a kill rolls a fresh drift speed', () => {
    const droid = makeShip({
      userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 1,
      shpclass: DROID_CLASS_VAKORY, status: GESTAT_AUTO, speed2b: 0, dirty: false,
    });
    const h = buildDroidHarness([droid], 0.99);

    h.svc.onShipDestroyed(makeKill('p1', droid.userid));

    expect(droid.speed2b).toBeCloseTo(4_950, 6);
    expect(droid.dirty).toBe(true);
  });

  /**
   * The same handler with a player on both ends. Both dispatches are guarded by
   * the `@Droid-` prefix, and neither may fire.
   *
   * If the victim guard were dropped, `handleDroidDied` would call
   * `removeFromGame` on a PLAYER — and the killed-event bookkeeping would name
   * a player as a Droid. Player deaths have their own respawn path; a Droid
   * removal here would take the ship out from under it.
   *
   * Breaks if: either prefix guard is removed or negated.
   */
  it('a player-on-player kill touches nothing the Droid tick owns', () => {
    const victim = makeShip({ userid: 'p2', shipno: 1, channel: 3 });
    const killer = makeShip({ userid: 'p1', shipno: 1, channel: 2, speed2b: 777 });
    const h = buildDroidHarness([victim, killer], 0.99);
    h.svc.getLivePopulation().get(DROID_CLASS_VAKORY)!.add(`${DROID_USERID_PREFIX}9`);

    h.svc.onShipDestroyed(makeKill('p2', 'p1'));

    // The victim's ship is still in the table — nothing removed it.
    expect(h.ships.has('p2:1')).toBe(true);
    expect(h.killed).toHaveLength(0);
    // The killer did not get the Droid's post-kill drift roll.
    expect(killer.speed2b).toBe(777);
    // And the unrelated Droid still holds its slot.
    expect(h.svc.getLivePopulation().get(DROID_CLASS_VAKORY)!.size).toBe(1);
  });

  /**
   * CHARACTERIZATION (canon has no equivalent: C's droid table is fixed-size
   * and a slot always exists). A Droid can be killed in the same volley in
   * which it kills — mines and torpedoes resolve several ships per tick — so
   * `handleDroidWon` can be handed an attacker that `handleDroidDied` has
   * already removed from the ship table.
   *
   * `if (!droid) return` is the guard. Without it the handler throws inside an
   * event listener, and the whole `combat.ship-destroyed` fan-out for that tick
   * dies with it: whatever runs after this listener — score, loot, mail —
   * never happens.
   *
   * Breaks if: the null guard is removed (TypeError on `droid.speed2b`).
   */
  it('survives a kill credited to a Droid that is already gone', () => {
    const bystander = makeShip({ userid: 'p1', shipno: 1, channel: 2 });
    const h = buildDroidHarness([bystander], 0.99);

    expect(() =>
      h.svc.onShipDestroyed(makeKill('p2', `${DROID_USERID_PREFIX}404`)),
    ).not.toThrow();
    expect(h.ships.has('p1:1')).toBe(true);
  });
});

describe('the population ledger — a dead Droid frees its slot', () => {
  /**
   * `droid_died` (GEDROIDS.C:534) hands the slot back so the class can refill.
   * In this port the slot IS the `livePopulation` set entry, and the spawn
   * evaluation refuses to spawn while `pop.size >= DROID_MAX_PER_CLASS`.
   *
   * If the entry is not deleted the class is permanently full of a ship that no
   * longer exists, and the player's PvE targets stop arriving for the rest of
   * the process's life — the exact failure a returning player reads as "the
   * game is empty".
   *
   * The immediate assertion is the sharp one: a later tick would clean a stale
   * entry itself (`actOnDroid` deletes a userid with no ship), so only the
   * check taken before any further tick can distinguish the two.
   *
   * Breaks if: `livePopulation.get(classNumber)?.delete(userid)` is removed
   * from `handleDroidDied`, or `removeFromGame` is not called.
   */
  it('the slot is released on the kill, and the next evaluation refills it', () => {
    const player = makeShip({ userid: 'p1', shipno: 1, channel: 2, xcoord: 5, ycoord: 5 });
    const doomed = makeShip({
      userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 3,
      shpclass: DROID_CLASS_VAKORY, status: GESTAT_AUTO, xcoord: 40, ycoord: 40,
    });
    const sibling = makeShip({
      userid: `${DROID_USERID_PREFIX}2`, shipno: 1, channel: 4,
      shpclass: DROID_CLASS_VAKORY, status: GESTAT_AUTO, xcoord: 41, ycoord: 41,
    });
    const h = buildDroidHarness([player, doomed, sibling], 0.99, [DROID_CLASS_VAKORY]);
    const vakory = h.svc.getLivePopulation().get(DROID_CLASS_VAKORY)!;
    vakory.add(doomed.userid);
    vakory.add(sibling.userid);
    expect(vakory.size).toBe(DROID_MAX_PER_CLASS);

    h.svc.onShipDestroyed({
      victimId: `${doomed.userid}:1`, attackerId: 'p1:1',
      victimShipKey: `${doomed.userid}:1`, attackerShipKey: 'p1:1',
      victimUserid: doomed.userid, attackerUserid: 'p1',
      attackerChannel: 2, weapon: 'phaser',
      sector: { x: 40, y: 40 }, tickAt: new Date(), loot: [], scoreAwarded: 50,
    });

    // Immediately, before any further tick can tidy up after it:
    expect(vakory.has(doomed.userid)).toBe(false);
    expect(vakory.size).toBe(DROID_MAX_PER_CLASS - 1);
    expect(h.ships.has(`${doomed.userid}:1`)).toBe(false);
    expect(h.killed.map((k) => k.shipId)).toEqual([doomed.userid]);
    expect(h.killed[0].shpclass).toBe(DROID_CLASS_VAKORY);

    // One spawn cadence later the class is whole again, with a NEW ship.
    h.tick(DROID_SPAWN_TICK_CADENCE);

    expect(vakory.size).toBe(DROID_MAX_PER_CLASS);
    expect(vakory.has(doomed.userid)).toBe(false);
    expect(vakory.has(sibling.userid)).toBe(true);
  });

  /**
   * `if (!state) continue` — the spawn evaluation walks all three classes in
   * one pass (GEMAIN.C:2325-2400 is a loop over the droid table, not a single
   * attempt). `DroidSpawner.spawn` returns undefined when it cannot place a
   * ship, and one class failing must not take the other two down with it: the
   * Vakory is the only thing a stock Interceptor can kill (CLAUDE.md), so a
   * Scow placement failure silently costing the player every Vakory is a whole
   * evening with no reachable target.
   *
   * Breaks if: that `continue` becomes a `return` or a `break`.
   */
  it('a class the spawner cannot place does not block the classes behind it', () => {
    const player = makeShip({ userid: 'p1', shipno: 1, channel: 2, xcoord: 5, ycoord: 5 });
    const h = buildDroidHarness([player], 0.99, [DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY]);

    h.tick(DROID_SPAWN_TICK_CADENCE);

    const pop = h.svc.getLivePopulation();
    expect(h.spawnRequests).toEqual([
      DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY,
    ]);
    expect(pop.get(DROID_CLASS_SCOW)!.size).toBe(0);
    expect(pop.get(DROID_CLASS_TRANSPORT)!.size).toBe(1);
    expect(pop.get(DROID_CLASS_VAKORY)!.size).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B) PHYSICS — the parts of moveship that live in the caller
// ═══════════════════════════════════════════════════════════════════════════

interface GravityBodyStub {
  xcoord: number;
  ycoord: number;
  plnum: number;
  type: number;
  destination?: { xcoord: number; ycoord: number };
}

interface PhysicsHarness {
  ship: ShipState;
  gravity: PhysicsGravityEvent[];
  destructCancelled: unknown[];
  /** Advance the fleet one full canon movement step (three 1-second ticks). */
  step: () => void;
}

/**
 * `channel` is canon's `zothusn`: the ship's fixed table slot, which decides
 * which of the three seconds it moves on (GEMAIN.C:2472-2489). Channel 0 moves
 * on the first tick of each group of three, so firing three ticks advances the
 * ship exactly once — one canon movement step, whatever the stride phase.
 */
function buildPhysicsHarness(
  ship: ShipState,
  bodies: readonly GravityBodyStub[] | null = null,
): PhysicsHarness {
  const ships = new Map([[shipKey(ship.userid, ship.shipno), ship]]);
  const shipState = {
    findAllShips: () => Array.from(ships.values()),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = ships.get(shipKey(u, n));
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { maxAcceleration: 3000, maxWarp: 10 });

  const events = new EventEmitter2();
  const gravity: PhysicsGravityEvent[] = [];
  const destructCancelled: unknown[] = [];
  events.on(PHYSICS_GRAVITY, (e: PhysicsGravityEvent) => gravity.push(e));
  events.on(PHYSICS_DESTRUCT_CANCELLED, (e: unknown) => destructCancelled.push(e));

  const subs: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      if (kind === TickKind.SHIP_UPDATE) subs.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const galaxy = bodies
    ? ({ getGravityBodies: () => bodies } as never)
    : undefined;

  const svc = new PhysicsTickService(tickService, shipState, cache, events, galaxy);
  svc.onModuleInit();

  return {
    ship, gravity, destructCancelled,
    step: () => {
      for (let i = 0; i < 3; i++) {
        for (const fn of subs) {
          fn({ kind: TickKind.SHIP_UPDATE, tickNumber: i + 1, firedAt: new Date() });
        }
      }
    },
  };
}

/**
 * A ship coasting at 100 raw units in normal space, so one movement step is
 * 100/COORD_SCALE = 0.0015384 sectors — small enough that a body can be placed
 * inside gravity's 250-raw-unit outer band, which is a few hundredths of a
 * sector wide.
 */
function coastingShip(over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: 'u1', shipno: 1, channel: 0, shpclass: 1,
    heading: 90, head2b: 90, speed: 100, speed2b: 100,
    xcoord: 5, ycoord: 5, energy: 65_000, status: GESTAT_USER, where: 0,
    ...over,
  });
}

describe('gravity applied through the real tick', () => {
  /**
   * `gravity` inside `moveship` (GEFUNCS.C:794-795, 836-905): under 25 raw
   * units of a planet, `ptr->damage = 101.0` — past 100, which is death.
   *
   * `checkGravity` is pure and has its own spec; the branch that has never been
   * entered is the CALLER's, which turns the returned effect into ship state.
   * The port adds `deathCause` there, because kill resolution runs later and
   * sees only a damage figure with no attacker — without it the death mail told
   * a pilot who had flown into a planet that "an unknown assailant" got them.
   *
   * Breaks if: the crash arm of `event.effect.kind === 'crash'` is swapped for
   * the wormhole arm (the ship would be teleported instead of killed), the
   * damage assignment becomes `+=` on a hull that survives it, or `deathCause`
   * stops naming the planet.
   */
  it('flying into a planet writes the hull off and records what killed you', () => {
    const h = buildPhysicsHarness(coastingShip(), [
      { xcoord: 5.0015, ycoord: 5, plnum: 7, type: PLTYPE_PLNT },
    ]);

    h.step();

    expect(h.ship.damage).toBe(101);
    expect(h.ship.deathCause).toEqual({ kind: 'gravity', what: 'planet 7' });
    expect(h.gravity.map((e) => e.band)).toEqual([3]);
    expect(h.gravity[0].isWormhole).toBe(false);
  });

  /**
   * The other arm: a wormhole moves you to its far end, costs 5.5 hull and
   * calls `cleartm(usrn)` — every torpedo and missile tracking you loses its
   * lock (GEFUNCS.C:890-900).
   *
   * The lock clearing is the part a player's life depends on, and it is the
   * caller's job here: the pure helper only reports `clearProjectiles: true`.
   * Both the channel AND the distance have to be released — CombatTickService
   * walks slots by CHANNEL, so a channel left set is still flown, and a
   * distance of 0 goes negative on the next step and detonates at full charge.
   *
   * Breaks if: the `cleartm` loops are dropped or narrowed to distances only,
   * the destination is not applied, or the 5.5 toll becomes an assignment.
   */
  it('a wormhole moves you, bills you 5.5, and shakes every lock off', () => {
    const ship = coastingShip({
      damage: 10,
      ltorpsChannel: [3, 255, 255], ltorpsDistance: [5_000, 0, 0],
      lmisslChannel: [4, 255, 255], lmisslDistance: [7_000, 0, 0],
    });
    const h = buildPhysicsHarness(ship, [
      {
        xcoord: 5.0015, ycoord: 5, plnum: 2, type: PLTYPE_WORM,
        destination: { xcoord: 12.25, ycoord: -3.5 },
      },
    ]);

    h.step();

    expect(h.ship.xcoord).toBe(12.25);
    expect(h.ship.ycoord).toBe(-3.5);
    expect(h.ship.damage).toBeCloseTo(15.5, 6);
    expect(h.ship.ltorpsChannel).toEqual([255, 255, 255]);
    expect(h.ship.ltorpsDistance).toEqual([0, 0, 0]);
    expect(h.ship.lmisslChannel).toEqual([255, 255, 255]);
    expect(h.ship.lmisslDistance).toEqual([0, 0, 0]);
    expect(h.gravity.map((e) => e.band)).toEqual([3]);
  });

  /**
   * `if (!event.effect) continue` — bands 1 and 2 are WARNINGS. C prints
   * GRAVITY1/GRAVITY2 and does nothing else (GEFUNCS.C:857-870); the ship keeps
   * its course, its speed and its hull.
   *
   * This is the branch that makes the mechanic survivable at all: the ladder
   * exists so a pilot can pull away. If the guard were missing, the first tug
   * at 250 units out would apply the innermost effect and every near miss would
   * be a death.
   *
   * Breaks if: the `continue` is removed, or the band thresholds are widened so
   * an outer band carries an effect.
   */
  it('a warning band warns and nothing else', () => {
    const h = buildPhysicsHarness(coastingShip(), [
      { xcoord: 5.02, ycoord: 5, plnum: 4, type: PLTYPE_PLNT },
    ]);

    h.step();

    expect(h.gravity.map((e) => e.band)).toEqual([1]);
    expect(h.ship.damage).toBe(0);
    expect(h.ship.deathCause).toBeUndefined();
    // Still flying, still on the same vector — one step of 100/65000.
    expect(h.ship.xcoord).toBeCloseTo(5 + 100 / 65_000, 9);
    expect(h.ship.speed).toBe(100);
  });
});

describe('the movement-maintenance debit', () => {
  /**
   * `moveship`'s per-move debit: a player ship pays MOVENGUSE every step, and
   * when it cannot the throttle order is zeroed so the ship coasts down
   * (GEFUNCS.C:773-790). The `debit.ok === false` arm had never been entered.
   *
   * A ship whose tanks are dry and whose `speed2b` is left standing keeps its
   * ordered speed forever: free flight, no energy, and — because the same
   * `speed2b` is what the helm re-reads — no way for the pilot to tell the
   * engines are dead. Canon's answer is that you drift to a stop and have to
   * flux.
   *
   * Breaks if: the else arm stops zeroing `speed2b`, or the debit floor moves
   * so an empty tank still passes.
   */
  it('an empty tank zeroes the throttle order rather than flying for free', () => {
    const h = buildPhysicsHarness(coastingShip({ energy: 5 }));

    h.step();

    expect(h.ship.speed2b).toBe(0);
    // Refused, not partially spent — the debit is all or nothing.
    expect(h.ship.energy).toBe(5);
    // This step's motion already happened; the coast-down starts next step.
    expect(h.ship.speed).toBe(100);
  });
});

describe('crossing into the neutral zone', () => {
  /**
   * Inside `moveship`, on the tick a ship enters a new sector:
   *
   *   ptr->hostile = 0;
   *   if (ptr->destruct > 0 && neutral(&newsect))
   *     { prfmsg(SELFD4); ptr->destruct = 0; }
   *
   * GEFUNCS.C:724-730. `applySectorChangeEffects` is pinned by its own spec —
   * what was not pinned is that a ship flying through the tick ever REACHES it,
   * which is the failure docs/TEST_STRATEGY.md describes: a helper proved
   * correct with values the caller never supplies.
   *
   * Running for the neutral zone with an armed self-destruct is the one escape
   * a cornered pilot has. If the caller never applies the effects, the
   * countdown keeps running after the ship reaches the only safe sector in the
   * galaxy and the pilot dies inside it.
   *
   * The ship crosses x = 1.0 travelling -x, so preSector (1,0) → postSector
   * (0,0), which is the neutral zone.
   *
   * Breaks if: `applySectorChangeEffects` is no longer called from the
   * sector-change block, the block's `preSector !== postSector` comparison is
   * inverted, or the cancellation event is fired without the state change.
   */
  it('cancels an armed self-destruct and clears hostile on arrival', () => {
    const h = buildPhysicsHarness(coastingShip({
      xcoord: 1.0005, ycoord: 0.5, heading: 270, head2b: 270,
      destruct: 5, hostile: 3,
    }));

    h.step();

    expect(Math.floor(h.ship.xcoord)).toBe(0);
    expect(h.ship.destruct).toBe(0);
    expect(h.ship.hostile).toBe(0);
    expect(h.destructCancelled).toHaveLength(1);
  });

  /**
   * The control: the same armed countdown crossing into an ORDINARY sector is
   * left alone. `neutral(&newsect)` is sector (0,0) and nothing else — a ship
   * that could disarm its self-destruct by crossing any boundary would make the
   * command free, and the neutral zone would stop being the thing worth running
   * for.
   *
   * `hostile` still clears, because canon clears it on ANY sector change.
   *
   * Breaks if: the neutral-zone test is dropped from the cancellation
   * condition.
   */
  it('leaves the countdown running when the new sector is not the neutral zone', () => {
    const h = buildPhysicsHarness(coastingShip({
      xcoord: 8.0005, ycoord: 3.5, heading: 270, head2b: 270,
      destruct: 5, hostile: 3,
    }));

    h.step();

    expect(Math.floor(h.ship.xcoord)).toBe(7);
    expect(h.ship.destruct).toBe(5);
    expect(h.ship.hostile).toBe(0);
    expect(h.destructCancelled).toHaveLength(0);
  });
});
