/**
 * Projectile flight, mine attribution and firer lookup — the decision branches
 * of the combat tick that round one left uncovered.
 *
 * `combat-tick-branches.spec.ts` pinned the dormant-slot guards, the decoy
 * roll, the shields-up/down damage split and kill attribution. What is left is
 * the set of branches that decide WHO a hit is blamed on and WHETHER a hit
 * happens at all to a ship that is no longer flying:
 *
 *   - the mine sweep's in-game guard and its layer-name capture
 *   - the missile copy of the "carrier left the game mid-flight" clear
 *   - the missile shield drain, which is proportional to the missile's charge
 *     rather than the torpedo's flat 10..29 roll
 *   - `findShipByChannel`'s two rejecting branches — nobody holds the channel,
 *     and somebody holds it but is out of the game
 *   - the missile charge fallback when a slot carries no stored energy
 *
 * Every case enters through the handler CombatTickService registers on
 * TickKind.PHYSICS. Nothing here calls a helper in `combat-math.ts` directly:
 * the helpers are already pinned by their own specs, and pinning them again
 * says nothing about whether the tick reaches them or what it writes back.
 * @see docs/TEST_STRATEGY.md — "test the caller's arithmetic, not the function's"
 *
 * Canon is `checktm` (GEFUNCS.C:1540-1690) for weapon flight, `minesweep`
 * (GEFUNCS.C:1414-1490) for mines and `shieldhit` (GEFUNCS.C:2430-2470) for
 * what a hit does to the shield.
 *
 * Randomness is a fixed value, never a seeded PRNG: a seed makes a case depend
 * on draw ORDER, so it stops failing for the reason it was written the moment
 * an unrelated draw is added upstream.
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
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
} from '../../../src/game/combat/combat-events';
import {
  DECOYTIME,
  FIRETICKS,
  GESTAT_AVAIL,
  GESTAT_USER,
  MDAMMAX,
  MISLSPED,
  MISSILE_CHARGE_MAX,
  SHIELD_FACTOR,
  TDAMMAX,
  TORPSPED,
} from '../../../src/game/constants';

/** A Random that always draws the same value. */
function fixedRandom(value: number): Random {
  return { next: () => value } as unknown as Random;
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

  // damageFactor 100 makes damageScale exactly 1, so every expectation below
  // is canon's raw arithmetic with no per-class multiplier hiding in it.
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

/** Mark-2 shield: `dmax = 80 - shieldtype * SHIELD_FACTOR` (GEFUNCS.C:2445). */
const MK2_DMAX = 80 - 2 * SHIELD_FACTOR;
/** `knock = dmax * damage/100` (GEFUNCS.C:2450). */
const knockFor = (drain: number): number => Math.floor(MK2_DMAX * (drain / 100));

describe('the mine sweep only touches ships that are still flying', () => {
  /**
   * `checkmines` walks the ship table and skips anything not ingame. The guard
   * is a call, not a status comparison: GEFUNCS.C:1426 `if (ingegame(zothusn))`,
   * and `ingegame` tests the USER's session state for a player and only falls
   * back to `status == GESTAT_AUTO` for an automaton (GEMAIN.C:2651-2665).
   * This docblock used to quote a status test that appears nowhere in the
   * original. Our map keeps a hull for a tick or two after it
   * stops being a ship (kill resolution runs last, shutdown drains later), so
   * without the guard a mine writes damage and `lastfired` onto a corpse — and
   * `lastfired` is exactly what kill attribution reads, so the mine's layer can
   * be handed a kill for a wreck they did not make.
   *
   * The live ship at the same coordinates is what keeps this case honest: it
   * proves the mine really was armed and in range, so the ghost's zero is the
   * guard rather than a mine that never went off.
   */
  it('detonates on the ship in game and leaves the out-of-game hull untouched', async () => {
    const live = makeShip({ userid: 'a', shipno: 1, channel: 5, xcoord: 5, ycoord: 5 });
    const ghost = makeShip({
      userid: 'b', shipno: 2, channel: 6, xcoord: 5, ycoord: 5, status: GESTAT_AVAIL,
    });
    const h = await makeHarness([live, ghost], fixedRandom(0.5));
    // timer 1 -> tickAll() takes it to 0 -> armed, and 0 % 5 === 0 so it is a
    // sweep candidate this tick. Half a sector away: 5000 raw, inside MINERANGE.
    h.mines.hydrate([
      { id: 7, channel: 77, timer: 1, xcoord: 5.5, ycoord: 5, deployedBy: 'ghostlayer' },
    ]);

    h.fire();

    expect(live.damage).toBeGreaterThan(0);
    expect(live.lastfired).toBe(77);
    // The corpse is not in the blast at all.
    expect(ghost.damage).toBe(0);
    expect(ghost.lastfired).toBe(-1);
    expect(ghost.lastfiredBy).toBeUndefined();
  });

  /**
   * The other side of the mine's attribution ternary. Round one pinned the case
   * where nobody holds the layer's channel any more (name must be left unset);
   * this is the case where the layer is still sitting in the map, and their
   * NAME has to be captured NOW. `lastfired` is only a channel number, and
   * channels are recycled — by the time the ship-loss mail is written the
   * lookup can name the wrong pilot or nobody at all. Every kill by a mine
   * would read "an unknown assailant".
   *
   * Shields are up so the capture is exercised in the shielded branch
   * (GEFUNCS.C:1447-1462), which is the copy round one did not reach.
   */
  it('records the layer by name when the layer is still in the game', async () => {
    const layer = makeShip({
      userid: 'a', shipno: 1, channel: 5, shipname: 'Nightshade', xcoord: 50, ycoord: 50,
    });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6, xcoord: 5, ycoord: 5,
      shieldstat: 1, shieldtype: 2, shield: 100,
    });
    const h = await makeHarness([layer, victim], fixedRandom(0.5));
    h.mines.hydrate([
      { id: 9, channel: 5, timer: 1, xcoord: 5.5, ycoord: 5, deployedBy: 'a' },
    ]);

    h.fire();

    expect(victim.lastfired).toBe(5);
    expect(victim.lastfiredBy).toEqual({ channel: 5, name: 'Nightshade' });
    // The shielded branch still put damage on the hull and charge off the
    // shield — GEFUNCS.C:1463 sits after the if/else.
    expect(victim.damage).toBeGreaterThan(0);
    expect(victim.shield).toBeLessThan(100);
    expect(victim.shieldstat).toBe(1);
    // The layer, fifty sectors away, is not in its own blast.
    expect(layer.damage).toBe(0);
  });
});

describe('a missile in flight against a carrier that has left the game', () => {
  /**
   * FR-027.3, the missile copy of a guard the torpedo loop already had.
   * `checktm` runs off the carrier's own incoming table, so a hull that has
   * stopped being a ship still carries live slots. Walking them lands damage
   * and `lastfired` on a corpse — and worse, keeps the slot alive so the same
   * missile detonates again on whatever reuses the record.
   *
   * Distance is deliberately several ticks out, so the missile is unambiguously
   * live: if the guard were removed the slot would simply step closer, which is
   * what this asserts against.
   */
  it('clears the slot silently instead of walking it', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const corpse = makeShip({
      userid: 'b', shipno: 2, channel: 6, status: GESTAT_AVAIL,
      lmisslChannel: [5, 255, 255],
      lmisslDistance: [MISLSPED * 5, 0, 0],
      lmisslEnergy: [30_000, 0, 0],
    });
    const h = await makeHarness([firer, corpse], fixedRandom(0.5));

    h.fire();

    expect(corpse.lmisslChannel[0]).toBe(255);
    expect(corpse.lmisslDistance[0]).toBe(0);
    expect(corpse.lmisslEnergy[0]).toBe(0);
    expect(corpse.damage).toBe(0);
    expect(corpse.lastfired).toBe(-1);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
  });
});

describe('a missile arriving on a raised shield', () => {
  /**
   * Canon drains the shield by the missile's own CHARGE, not by the torpedo's
   * flat roll:
   *
   *   power = mptr->energy/999;  power = power * (rndm(.5)+.5);  shieldhit(power)
   *   (GEFUNCS.C:1649-1651)
   *
   * while a torpedo drains `(gernd()%20)+10` (GEFUNCS.C:1563). Using the
   * torpedo formula for both caps every missile at a 10..29 drain however much
   * energy the firer poured into it, which deletes the entire reason to charge
   * a missile up and makes a big missile strictly worse than a torpedo.
   *
   * At a 0.5 draw and a 49,950 charge: floor(49950/999) = 50, times
   * (0.5*0.5+0.5) = 0.75 -> 37 drain, and a Mark-2 shield loses
   * floor(72 * 0.37) = 26 charge. The torpedo formula at the same draw would
   * be a 20 drain and a 14 knock, so the two cannot be confused.
   */
  it('drains the shield in proportion to the charge it carried', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5 });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      shieldstat: 1, shieldtype: 2, shield: 100,
      lmisslChannel: [5, 255, 255],
      // A STRICT less-than in canon: below MISLSPED arrives, exactly MISLSPED
      // does not. @see GEFUNCS.C:1615 `if (mptr->distance < mislsped)`
      lmisslDistance: [MISLSPED - 1, 0, 0],
      lmisslEnergy: [49_950, 0, 0],
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.5));

    h.fire();

    const expectedKnock = knockFor(37);
    expect(expectedKnock).toBe(26); // guards the arithmetic in the comment
    expect(victim.shield).toBe(100 - expectedKnock);
    // Not the torpedo's flat roll, which would have knocked only 14 off.
    expect(victim.shield).not.toBe(100 - knockFor(20));
    expect(victim.shieldstat).toBe(1);
    // Shields are not immunity, but a missile through them rolls rndm(.1)
    // rather than the torpedo's rndm(.5) — GEFUNCS.C:1641.
    expect(victim.damage).toBeCloseTo(MDAMMAX * (49_950 / MISSILE_CHARGE_MAX) * 0.05, 6);
    const hit = found(h, COMBAT_HIT) as CombatHitEvent | undefined;
    expect(hit?.weapon).toBe('missile');
    expect(hit?.damageShield).toBe(expectedKnock);
    // Canon does NOT battle-lock on impact. `checktm` only counts `cantexit`
    // down (GEFUNCS.C:1541 `--(ptr->cantexit);`); every `= FIRETICKS` sits in
    // GECMDS.C at fire or lock time, so the lock this hit inherits was armed by
    // `lockon` several ticks earlier and is already expiring.
    expect(victim.cantexit).toBe(0);
    expect(firer.cantexit).toBe(0);
  });

  /**
   * CHARACTERIZATION, not canon: canon's missile record always carries an
   * energy, so it has no counterpart for a slot that has none. The port's
   * `lmisslEnergy` is a separate array that can be short — a hull loaded from
   * Postgres before the column existed, or a slot written by a caller that only
   * set channel and distance — and the fallback decides how much damage that
   * missile does. `?? 0` would make it harmless; `?? MISSILE_CHARGE_MAX` makes
   * it a maximum-charge missile, which is what the code does today.
   *
   * The live firer here also pins the NAMED side of the attribution ternary in
   * the shields-down branch: the firer is in the map, so their name is captured
   * with the hit rather than left to a channel lookup at kill time.
   */
  it('treats a slot with no stored charge as a full-charge missile', async () => {
    const firer = makeShip({ userid: 'a', shipno: 1, channel: 5, shipname: 'Vandal' });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      lmisslChannel: [5, 255, 255],
      lmisslDistance: [MISLSPED - 1, 0, 0],
      lmisslEnergy: [], // no charge recorded for this slot at all
    });
    const h = await makeHarness([firer, victim], fixedRandom(0.5));

    h.fire();

    // Shields down: rndm(.5)+.5 = 0.75 of the full MDAMMAX ceiling.
    expect(victim.damage).toBeCloseTo(MDAMMAX * 0.75, 6);
    expect(victim.lastfired).toBe(5);
    expect(victim.lastfiredBy).toEqual({ channel: 5, name: 'Vandal' });
    expect(victim.lmisslChannel[0]).toBe(255);
  });
});

describe('a hit whose firer cannot be resolved to a ship', () => {
  /**
   * `findShipByChannel` returns null when nobody holds the channel — canon
   * nulls the same reference at GEFUNCS.C:1224 when the firer has left. A
   * torpedo outlives its firer's session, so this is a real state and not a
   * defensive one.
   *
   * Two things must follow, and both are money: the hit event must NOT name a
   * ship (channels are recycled, so naming one blames whoever inherited the
   * number), and `lastfiredBy` must stay unset rather than being written with a
   * null name — kill resolution reads it, and a `{ name: null }` record is a
   * kill credited to nobody wearing a name badge.
   */
  it('reports the raw channel and records no name', async () => {
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      ltorpsChannel: [9, 255, 255], // channel 9 is held by nobody
      ltorpsDistance: [TORPSPED, 0, 0],
    });
    const h = await makeHarness([victim], fixedRandom(0.5));

    h.fire();

    expect(victim.damage).toBeCloseTo(TDAMMAX * 0.75, 6);
    expect(victim.lastfired).toBe(9);
    expect(victim.lastfiredBy).toBeUndefined();
    const hit = found(h, COMBAT_HIT) as CombatHitEvent | undefined;
    expect(hit?.attackerId).toBe('?:9');
    expect(hit?.victimId).toBe(shipKey('b', 2));
    // No battle lock on impact — GEFUNCS.C:1541 only decrements it.
    expect(victim.cantexit).toBe(0);
  });

  /**
   * The second rejecting branch: a ship DOES hold the channel, but it is no
   * longer in the game (`status` neither GESTAT_USER nor GESTAT_AUTO). Without
   * that clause the corpse is treated as the firer — it is named on the hit, it
   * is battle-locked by a shot it did not fire, and kill resolution can hand it
   * the kill. Shields are up so the shielded branch's copy of the ternary is
   * the one under test.
   *
   * At a 0.5 draw the torpedo drains 10 + floor(0.5*20) = 20, and a Mark-2
   * shield loses floor(72 * 0.20) = 14 charge.
   */
  it('does not treat an out-of-game holder of the channel as the firer', async () => {
    const corpse = makeShip({
      userid: 'a', shipno: 1, channel: 5, shipname: 'Wreck', status: GESTAT_AVAIL,
    });
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      shieldstat: 1, shieldtype: 2, shield: 100,
      ltorpsChannel: [5, 255, 255],
      ltorpsDistance: [TORPSPED, 0, 0],
    });
    const h = await makeHarness([corpse, victim], fixedRandom(0.5));

    h.fire();

    const hit = found(h, COMBAT_HIT) as CombatHitEvent | undefined;
    expect(hit?.attackerId).toBe('?:5');
    expect(victim.lastfiredBy).toBeUndefined();
    // The corpse is not battle-locked by a shot it is not credited with.
    expect(corpse.cantexit).toBe(0);
    // The hit itself still lands in full.
    expect(victim.shield).toBe(100 - knockFor(20));
    expect(victim.damage).toBeCloseTo(TDAMMAX * 0.25, 6);
    expect(victim.lastfired).toBe(5);
  });

  /**
   * The decoy intercept carries the same lookup, and the same rule: a decoy
   * that eats a torpedo from a firer who has since left must report the raw
   * channel. Naming a live ship here tells the defender — in the event the
   * client renders — that a bystander is shooting at them, which is how a
   * neutral gets shot back at.
   *
   * A 0 draw makes `gernd()%decodds == 0` true on the first live decoy
   * (GEFUNCS.C:1584), whatever DECODDS is.
   */
  it('reports the raw channel on a decoy intercept too', async () => {
    const victim = makeShip({
      userid: 'b', shipno: 2, channel: 6,
      decout: [DECOYTIME, 0, 0],
      ltorpsChannel: [9, 255, 255], // nobody holds channel 9
      // Inside the 5000 threshold both before and after the decrement, so the
      // case does not depend on which of the two the port compares.
      ltorpsDistance: [TORPSPED + 1000, 0, 0],
    });
    const h = await makeHarness([victim], fixedRandom(0));

    h.fire();

    const intercept = found(h, COMBAT_DECOY_INTERCEPT) as CombatDecoyInterceptEvent | undefined;
    expect(intercept).toBeDefined();
    expect(intercept?.attackerId).toBe('?:9');
    expect(intercept?.defenderId).toBe(shipKey('b', 2));
    expect(intercept?.weapon).toBe('torpedo');
    // The decoy that worked is burned and the torpedo is gone.
    expect(victim.decout[0]).toBe(0);
    expect(victim.ltorpsChannel[0]).toBe(255);
    expect(victim.damage).toBe(0);
    expect(found(h, COMBAT_HIT)).toBeUndefined();
  });
});
