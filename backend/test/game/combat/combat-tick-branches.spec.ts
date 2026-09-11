/**
 * The combat tick's decision branches, exercised through the tick itself.
 *
 * Every case here goes through the handler CombatTickService registers on
 * TickKind.PHYSICS — the real calling path — rather than through the pure
 * helpers in `combat-math.ts`. That distinction is the whole point of the file.
 * `decoy-consumption.spec.ts`, `shield-projectile-fidelity.spec.ts` and
 * `mine-shield-fidelity.spec.ts` all pin the arithmetic beautifully and none of
 * them can tell you whether the tick reaches it, or what it writes back to the
 * ship when it does. Three defects survived this codebase in exactly that gap.
 * @see docs/TEST_STRATEGY.md — "test the caller's arithmetic, not the function's"
 *
 * Canon is `checktm` (GEFUNCS.C:1540-1690) for weapon flight, `minesweep`
 * (GEFUNCS.C:1414-1490) for mines, `shieldhit` (GEFUNCS.C:2430-2470) for what a
 * hit does to the shield, and `killem` (GEFUNCS.C:1100-1150) for who is paid
 * for the wreck. What breaks if each branch is wrong is stated per case.
 *
 * Randomness is a fixed value or a fixed short sequence, never a seeded PRNG:
 * a seed makes the case depend on draw ORDER, so it stops failing for the
 * reason it was written the moment an unrelated draw is added upstream.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_SHIP_DESTROYED,
  CombatDecoyInterceptEvent,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';
import {
  DECOYTIME,
  FIRETICKS,
  GESTAT_AUTO,
  GESTAT_AVAIL,
  GESTAT_USER,
  MISLSPED,
  SHIELDDM,
  TDAMMAX,
  TORPSPED,
} from '../../../src/game/constants';
import { I_GOLD } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

/** A Random that always draws the same value. */
function fixedRandom(value: number): Random {
  return { next: () => value } as unknown as Random;
}

/** A Random that walks a fixed list, then repeats its last value forever. */
function sequenceRandom(values: number[]): Random {
  let i = 0;
  return {
    next: () => {
      const v = values[Math.min(i, values.length - 1)] ?? 0;
      i += 1;
      return v;
    },
  } as unknown as Random;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    // phasrtype 0 (the factory default) keeps the reload block — and its
    // energy debit — out of every fixture, so the only PRNG draws in a tick
    // are the ones under test.
    shipname: 'T',
    energy: 50_000,
    lastfired: -1,
    shieldtype: 2,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    decout: [0, 0, 0],
    items: new Array(14).fill(0n) as bigint[],
    status: GESTAT_USER,
    cybmine: 255,
    topspeed: 8,
    // Attribution reads `channel` (this port's usrnum), never `shipno`.
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

interface Harness {
  ships: Map<string, ShipState>;
  mines: MineRegistry;
  events: EventEmitter2;
  emitted: Array<{ event: string; payload: unknown }>;
  deletedMines: number[];
  /** Run one PHYSICS tick through the handler the service actually registers. */
  fire(): void;
}

async function makeHarness(ships: ShipState[], random: Random): Promise<Harness> {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(u, n));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    // The real service drops the ship out of the active map; anything that
    // walks findAllShips afterwards must not see it.
    removeFromGame: (s: ShipState) => { shipMap.delete(shipKey(s.userid, s.shipno)); },
  } as unknown as ShipStateService;

  let handler: ((ctx: TickContext) => void) | undefined;
  const tickService = {
    subscribe: (_kind: TickKind, h: (ctx: TickContext) => void) => {
      handler = h;
      return () => undefined;
    },
    registerSnapshotProvider: vi.fn(),
  } as unknown as TickService;

  const deletedMines: number[] = [];
  const mineRepo = {
    findAllActive: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn((id: number) => { deletedMines.push(id); return Promise.resolve(); }),
  } as unknown as MineRepository;

  const classCache = {
    getDamageFactor: () => 100,
    getMaxTons: () => 5_000,
    getPoints: () => 50,
    getMaxShields: () => 2,
    getMaxPhaser: () => 5,
    getHasTorpedo: () => true,
    getHasMissile: () => true,
    getHasCloak: () => false,
  } as unknown as ShipClassCacheService;

  const mines = new MineRegistry();
  const events = new EventEmitter2();
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;

  const service = new CombatTickService(
    tickService, shipState, mineRepo, mines, random, events, logger, classCache,
  );
  // Registers the PHYSICS handler for real. Hydrates an empty mine table, so
  // any mine a case wants must be added to `mines` AFTER this returns.
  await service.onModuleInit();

  const emitted: Array<{ event: string; payload: unknown }> = [];
  events.onAny((event: string | string[], payload: unknown) => {
    emitted.push({ event: Array.isArray(event) ? event.join('.') : event, payload });
  });

  let tickNumber = 0;
  return {
    ships: shipMap,
    mines,
    events,
    emitted,
    deletedMines,
    fire: () => {
      tickNumber += 1;
      if (handler === undefined) throw new Error('CombatTickService never subscribed to PHYSICS');
      handler({ kind: TickKind.PHYSICS, tickNumber, firedAt: new Date() });
    },
  };
}

const found = (h: Harness, name: string): unknown =>
  h.emitted.find((e) => e.event === name)?.payload;

describe('a projectile slot with no live projectile in it must not detonate', () => {
  /**
   * Canon opens the torpedo walk with `if (tptr->distance > 1)`
   * (GEFUNCS.C:1548). A slot at distance 0 or 1 is DORMANT, not arrived —
   * everything that CANCELS a torpedo does it by zeroing the distance. Without
   * the guard `0 - torpsped` is negative, falls through to hit resolution, and
   * detonates a torpedo that was already called off. That is a free kill on a
   * pilot who did nothing wrong.
   */
  it('clears a dormant torpedo slot instead of resolving a hit', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      ltorpsChannel: [5, 255, 255],
      ltorpsDistance: [1, 0, 0], // canon's boundary: `> 1` is alive, 1 is not
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.99));

    h.fire();

    expect(victim.damage).toBe(0);
    expect(victim.ltorpsChannel[0]).toBe(255);
    expect(victim.ltorpsDistance[0]).toBe(0);
    // cantexit is the battle lock a hit sets; still 0 means nothing landed.
    expect(victim.cantexit).toBe(0);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
  });

  /**
   * The missile half of the same guard: `if (mptr->distance > 0)`
   * (GEFUNCS.C:1613). The warp shake zeroes missile distances (GEFUNCS.C:506),
   * so a pilot who out-ran a volley used to be blown up by it on the next tick.
   */
  it('does not walk a missile slot whose distance is already zero', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      lmisslChannel: [5, 255, 255],
      lmisslDistance: [0, 0, 0],
      lmisslEnergy: [40_000, 0, 0],
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.99));

    h.fire();

    expect(victim.damage).toBe(0);
    expect(victim.cantexit).toBe(0);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
    // Characterization, not a canon claim: the port `continue`s past the slot
    // rather than clearing it, so the shaken-off missile stays parked at
    // distance 0 and is skipped again every tick. Canon's loop behaves the
    // same way — it simply never enters the body — but canon has no separate
    // "clear the slot" step to be missing, so this is the port's shape.
    expect(victim.lmisslChannel[0]).toBe(5);
    expect(victim.lmisslDistance[0]).toBe(0);
  });
});

describe('decoys are spent one at a time, by the tick that fires them', () => {
  /**
   * GEFUNCS.C:1581-1592 rolls `gernd()%decodds == 0` once PER LIVE DECOY and
   * breaks on the first winner, zeroing that slot and the torpedo. Two things
   * follow, and only the caller can be asked about either: a second decoy buys
   * a second roll, and the decoy that works is BURNED. The port once tested a
   * single boolean, so one decoy shrugged off everything fired at it for its
   * whole 15-tick life — the difference between surviving a volley and not.
   */
  it('rolls per decoy, spends only the slot that intercepted, and cancels the torpedo', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      decout: [DECOYTIME, DECOYTIME, 0],
      ltorpsChannel: [5, 255, 255],
      // Inside the 5000 threshold both before and after the decrement, so the
      // case does not depend on which of the two the port compares.
      ltorpsDistance: [TORPSPED + 1000, 0, 0],
    });
    // Draw 1 -> slot 0 misses: the roll is `floor(next * DECODDS) === 0` and
    // the shipped DECODDS is 11, so 0.5 lands on 5. Draw 2 -> slot 1
    // intercepts, because floor(0 * anything) is 0 whatever DECODDS is.
    const h = await makeHarness([firer, victim], sequenceRandom([0.5, 0]));

    h.fire();

    const intercept = found(h, COMBAT_DECOY_INTERCEPT) as CombatDecoyInterceptEvent | undefined;
    expect(intercept).toBeDefined();
    expect(intercept?.weapon).toBe('torpedo');
    expect(intercept?.defenderId).toBe(shipKey('b', 2));
    // The winner is burned; the one that missed only ages by this tick's
    // decrement, and is still there for the next torpedo.
    expect(victim.decout[1]).toBe(0);
    expect(victim.decout[0]).toBe(DECOYTIME - 1);
    expect(victim.ltorpsChannel[0]).toBe(255);
    expect(victim.damage).toBe(0);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
  });

  /**
   * The missile copy of the loop (GEFUNCS.C:1666-1677) with its own, tighter
   * 3000-unit threshold. It sat uncovered while the torpedo copy was tested —
   * the same asymmetry that let the Droid torpedo lock guard ship broken.
   */
  it('intercepts an incoming missile and clears its slot', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      decout: [DECOYTIME, 0, 0],
      lmisslChannel: [5, 255, 255],
      lmisslDistance: [MISLSPED + 500, 0, 0], // under 3000 either side of the step
      lmisslEnergy: [50_000, 0, 0],
    });
    const h = await makeHarness([firer, victim], fixedRandom(0));

    h.fire();

    const intercept = found(h, COMBAT_DECOY_INTERCEPT) as CombatDecoyInterceptEvent | undefined;
    expect(intercept?.weapon).toBe('missile');
    expect(victim.decout[0]).toBe(0);
    expect(victim.lmisslChannel[0]).toBe(255);
    expect(victim.lmisslDistance[0]).toBe(0);
    expect(victim.lmisslEnergy[0]).toBe(0);
    expect(victim.damage).toBe(0);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
  });
});

describe('what a hit does to a raised shield', () => {
  /**
   * `shieldhit` splits three ways and only ONE of them takes the shields out of
   * action: `wptr->shield <= 2` sets SHIELDDM and knocks a further `knock*3`
   * off the charge (GEFUNCS.C:2455-2461). SHIELDDM is not "down" — `shi up`
   * refuses it, and only the repair climb clears it. Collapsing on the milder
   * `< SHMINCHG` warning instead would put a pilot's shields out of a fight two
   * charge points early AND leave them re-raisable, which is both harder and
   * easier than canon at the same time.
   *
   * With a 0.5 draw the torpedo drains 10 + floor(0.5*20) = 20, and a Mark-2
   * shield loses floor((80 - 2*4) * 0.20) = 14 charge.
   */
  it('collapses a nearly-flat shield into SHIELDDM and still lands hull damage', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      shieldstat: 1, shieldtype: 2, shield: 10,
      ltorpsChannel: [5, 255, 255],
      ltorpsDistance: [TORPSPED, 0, 0], // arrives exactly this tick
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.5));

    h.fire();

    // Shields are not immunity: GEFUNCS.C:1558 applies hull damage in the
    // shields-UP branch too, halved (rndm(.5), so 0.25 * TDAMMAX at this draw).
    expect(victim.damage).toBeCloseTo(TDAMMAX * 0.25, 6);
    expect(victim.shieldstat).toBe(SHIELDDM);
    expect(victim.shield).toBeLessThan(0); // the extra knock*3 on collapse
    expect(victim.lastfired).toBe(5);
    // Canon does NOT battle-lock on impact. `checktm` only counts `cantexit`
    // down (GEFUNCS.C:1541 `--(ptr->cantexit);`); every `= FIRETICKS` sits in
    // GECMDS.C at fire or lock time, so the lock this hit inherits was armed by
    // `lockon` several ticks earlier and is already expiring.
    expect(victim.cantexit).toBe(0);
    expect(firer.cantexit).toBe(0);
  });

  it('leaves a healthy shield UP, merely drained', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      shieldstat: 1, shieldtype: 2, shield: 100,
      ltorpsChannel: [5, 255, 255],
      ltorpsDistance: [TORPSPED, 0, 0],
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.5));

    h.fire();

    expect(victim.shieldstat).toBe(1);
    expect(victim.shield).toBeGreaterThan(0);
    expect(victim.shield).toBeLessThan(100);
    expect(victim.damage).toBeCloseTo(TDAMMAX * 0.25, 6);
  });

  /**
   * The mine detonation has its own copy of the same branch
   * (GEFUNCS.C:1441-1463) — divide the blast by the shield MARK, then
   * `shieldhit(damage + 20)` — and `wptr->damage += damage` sits AFTER the
   * if/else, so hull damage lands either way. The port zeroed hull damage
   * behind raised shields once already, for torpedoes; the mine copy is the
   * one that was left untested.
   *
   * A mine's owner is long gone by the time it goes off, which is exactly the
   * case a later channel lookup cannot answer: nobody holds channel 77 here,
   * so `lastfiredBy` must be left unset rather than naming the wrong pilot.
   */
  it('a mine through raised shields blows them into SHIELDDM and still hurts the hull', async () => {
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      // Well clear of sector (0,0): the neutral zone is mine-immune (R-3).
      xcoord: 5, ycoord: 5,
      shieldstat: 1, shieldtype: 2, shield: 10,
    });
    const h = await makeHarness([victim], fixedRandom(0.5));
    // timer 1 -> tickAll() takes it to 0 -> armed, and 0 % 5 === 0 so it is a
    // sweep candidate this tick. Half a sector away: 5000 raw, inside MINERANGE.
    h.mines.hydrate([
      { id: 42, channel: 77, timer: 1, xcoord: 5.5, ycoord: 5, deployedBy: 'ghost' },
    ]);

    h.fire();

    expect(victim.damage).toBeGreaterThan(0);
    expect(victim.shieldstat).toBe(SHIELDDM);
    expect(victim.shield).toBeLessThan(0);
    // Credit for the kill goes to the layer's channel — GEFUNCS.C:1464.
    expect(victim.lastfired).toBe(77);
    // Nobody holds channel 77 any more, so no name may be invented.
    expect(victim.lastfiredBy).toBeUndefined();
    // A detonated mine leaves the table and the database.
    expect(h.mines.getAll()).toHaveLength(0);
    expect(h.deletedMines).toEqual([42]);
  });
});

describe('who gets paid for a wreck', () => {
  /**
   * `if (who >= 0 && who < nships && who != usrn)` — GEFUNCS.C:1103. The
   * `who != usrn` clause carries canon's own 12/19/91 comment about not
   * awarding a player points for killing himself. `findActiveAttackerByChannel`
   * is where the port keeps it, and getting it wrong is a credits bug: the
   * victim would be paid a kill, a score and their own cargo back.
   */
  it('credits nobody when the victim was its own last firer', async () => {
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6, damage: 100,
      lastfired: 6, // its own channel
      items: (() => { const it = new Array(14).fill(0n) as bigint[]; it[I_GOLD] = 1_000n; return it; })(),
    });
    const bystander = makeShip({ userid: 'c', shipno: 3, channel: 7 });
    const h = await makeHarness([victim, bystander], fixedRandom(0.99));

    h.fire();

    const evt = found(h, COMBAT_SHIP_DESTROYED) as CombatShipDestroyedEvent | undefined;
    expect(evt).toBeDefined();
    expect(evt?.attackerUserid).toBeNull();
    expect(evt?.loot).toEqual([]);
    expect(victim.kills).toBe(0);
    expect(bystander.kills).toBe(0);
    expect(bystander.items[I_GOLD]).toBe(0n);
    // The wreck leaves the active map either way.
    expect(h.ships.has(shipKey('b', 2))).toBe(false);
  });

  /**
   * The other half of the same guard: a channel that resolves to a ship which
   * is no longer in the game (`status` neither GESTAT_USER nor GESTAT_AUTO)
   * must not be paid. Channels are recycled, so paying one out blindly hands a
   * kill and a hold of cargo to whoever inherited the number.
   */
  it('credits nobody when the channel resolves to a ship that is out of the game', async () => {
    const ghost = makeShip({ userid: 'a', shipno: 1, channel: 5, status: GESTAT_AVAIL });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6, damage: 100, lastfired: 5,
      items: (() => { const it = new Array(14).fill(0n) as bigint[]; it[I_GOLD] = 1_000n; return it; })(),
    });
    const h = await makeHarness([ghost, victim], fixedRandom(0));

    h.fire();

    const evt = found(h, COMBAT_SHIP_DESTROYED) as CombatShipDestroyedEvent | undefined;
    expect(evt?.attackerUserid).toBeNull();
    expect(evt?.loot).toEqual([]);
    expect(ghost.kills).toBe(0);
    expect(ghost.items[I_GOLD]).toBe(0n);
  });

  /**
   * The paying case, for contrast, and the one the two guards above must not
   * break. A draw of 0 makes canon's `gernd()%5 + 1` divisor exactly 1, so the
   * whole stack moves (GEFUNCS.C:1126) — the killer inherits the hold.
   */
  it('pays the kill, the score and the cargo to a live attacker', async () => {
    const killer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6, damage: 100, lastfired: 5,
      items: (() => { const it = new Array(14).fill(0n) as bigint[]; it[I_GOLD] = 1_000n; return it; })(),
    });
    const h = await makeHarness([killer, victim], fixedRandom(0));

    h.fire();

    const evt = found(h, COMBAT_SHIP_DESTROYED) as CombatShipDestroyedEvent | undefined;
    expect(evt?.attackerUserid).toBe('a');
    expect(evt?.attackerShipKey).toBe(shipKey('a', 1));
    expect(evt?.scoreAwarded).toBe(50);
    expect(killer.kills).toBe(1);
    expect(killer.items[I_GOLD]).toBe(1_000n);
    expect(evt?.loot).toEqual([{ itemIndex: I_GOLD, amount: 1_000n }]);
  });

  /**
   * A hull already out of the game must not be killed a second time. Kill
   * resolution walks every ship with `damage >= 100` on every 6-second tick, so
   * without the status guard a wreck that lingers in the map pays its killer
   * again, and again, every tick — kill count, score and a fresh copy of the
   * loot each time.
   */
  it('does not re-kill a hull that is already out of the game', async () => {
    const wreck = makeShip({ userid: 'b', shipno: 2, channel: 6, damage: 120, status: GESTAT_AVAIL });
    const h = await makeHarness([wreck], fixedRandom(0.99));

    h.fire();

    expect(found(h, COMBAT_SHIP_DESTROYED)).toBeUndefined();
    expect(h.ships.has(shipKey('b', 2))).toBe(true);
  });

  /**
   * `cybmine` holds the CHANNEL of the player a Cybertron has claimed
   * (GECYBS.C:368). killem releases the claim so the Cybertron does not resume
   * hunting the pilot the instant they respawn in a fresh, undamaged hull.
   * Matching on `shipno` instead released the wrong Cybertron's claim — the
   * respawned player stayed marked and a bystander was freed.
   */
  it('releases the Cybertron claim on the dead pilot, and only that claim', async () => {
    const killer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({ userid: 'b', shipno: 2, channel: 6, damage: 100, lastfired: 5 });
    const hunter = makeShip({
      userid: 'cyb1', shipno: 1, channel: 8, status: GESTAT_AUTO, cybmine: 6,
    });
    const other = makeShip({
      userid: 'cyb2', shipno: 1, channel: 9, status: GESTAT_AUTO, cybmine: 5,
    });
    const h = await makeHarness([killer, victim, hunter, other], fixedRandom(0.99));

    h.fire();

    expect(hunter.cybmine).toBe(255);
    expect(other.cybmine).toBe(5);
  });

  /**
   * `cleartm` (GEFUNCS.C:1750-1778) walks every other ship when a firer dies
   * and frees the slots that reference it — torpedoes AND missiles. The missile
   * half is the one that was uncovered. Without it a dead pilot's missiles
   * carry on to detonate, so killing the shooter does not save you, and the
   * kill is credited to a channel that may since have been recycled to somebody
   * innocent.
   */
  it('clears the dead firer\'s in-flight missiles, and leaves a live firer\'s alone', async () => {
    const doomed = makeShip({ userid: 'a', shipno: 1, channel: 5, damage: 100, lastfired: 6 });
    const killer = makeShip({ userid: 'b', shipno: 2, channel: 6 });
    const bystander = makeShip({
      userid: 'c', shipno: 3, channel: 7,
      lmisslChannel: [5, 6, 255],
      lmisslDistance: [MISLSPED * 20, MISLSPED * 20, 0],
      lmisslEnergy: [30_000, 30_000, 0],
    });
    const h = await makeHarness([doomed, killer, bystander], fixedRandom(0.99));

    h.fire();

    // Slot 0 was fired by the ship that just died — gone.
    expect(bystander.lmisslChannel[0]).toBe(255);
    expect(bystander.lmisslDistance[0]).toBe(0);
    expect(bystander.lmisslEnergy[0]).toBe(0);
    // Slot 1 belongs to a firer who is still flying — it kept closing.
    expect(bystander.lmisslChannel[1]).toBe(6);
    expect(bystander.lmisslDistance[1]).toBe(MISLSPED * 20 - MISLSPED);
    expect(bystander.damage).toBe(0);
  });
});
