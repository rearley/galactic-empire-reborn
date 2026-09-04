/**
 * T053 — kill-attribution: when multiple attackers hit the same victim in
 * one tick, the kill is credited to whichever attacker's hit was processed
 * LAST (i.e., whoever's shipno ends up in `victim.lastfired` at the moment
 * the kill-resolution pass runs). Per the existing pass ordering, torpedoes
 * resolve before missiles, so a torpedo from A + missile from C => C wins.
 *
 * @see specs/006b-combat/tasks.md T053
 * @see GEFUNCS.C:killem, GEFUNCS.C:acctm
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and victim
    // by giving each a distinct shipno, so mirror it into channel.
    channel: over.channel ?? over.shipno ?? 1,
  };
}

async function makeHarness(ships: ShipState[], seed = 99) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    removeFromGame: (ship: { userid: string; shipno: number }) => {
      shipMap.delete(shipKey(ship.userid, ship.shipno));
    },
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as MineRepository;

  const mineRegistry = new MineRegistry();
  const events = new EventEmitter2();
  const logger = new Logger('KillAttributionSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, mineRegistry,
    new Mulberry32Adapter(seed), events, logger, classCache,
  );
  await service.onModuleInit();

  return {
    service, shipMap, events, shipState,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService — kill attribution (T053, FR-026)', () => {
  it('credits last attacker (missile after torpedo) when both hits land same tick and damage >= 100', async () => {
    // Alice (channel 7) torpedoes Bob; Carol (channel 9) missiles Bob; both
    // arrive same tick. Torps process before missiles in the carrier's slot
    // walk, so Carol's shipno is the value of bob.lastfired at kill time.
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0, kills: 0 });
    const carol = makeShip({ userid: 'c', shipno: 9, xcoord: 0, ycoord: 0, kills: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0,
      damage: 95, // pre-existing damage; either hit pushes him over 100
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0],   // resolves to hit
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [10, 0, 0],   // resolves to hit
      // Full charge: a missile's damage is now normalised against
      // MISSILE_CHARGE_MAX, so a 3000-charge missile does ~6 hull damage.
      lmisslEnergy: [50000, 0, 0],   // big charge → guaranteed >= 5 hull damage
    });

    const h = await makeHarness([alice, carol, bob]);

    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    expect(bob.damage).toBeGreaterThanOrEqual(100);
    expect(destroyedEvents).toHaveLength(1);
    const ev = destroyedEvents[0];
    expect(ev.victimId).toBe(shipKey('b', 2));
    // Carol fires last (missile after torpedo) → her channel wins.
    expect(ev.attackerChannel).toBe(9);
    expect(ev.attackerId).toBe(shipKey('c', 9));
    // Carol's kills incremented; Alice's not.
    expect(carol.kills).toBe(1);
    expect(alice.kills).toBe(0);
    // Bob is removed from the active map.
    expect(h.shipMap.has(shipKey('b', 2))).toBe(false);
  });

  /**
   * The bug this guards against, seen live: a pilot two sectors away who had
   * never fired a shot was named as the killer of a ship they never saw, and
   * was handed the kill, the loot and the score.
   *
   * Attribution used to resolve `lastfired` by scanning for `s.shipno ===
   * channel`. `shipno` is a PER-USER index, so it is 1 for every player's first
   * ship — the scan returned whichever ship sat first in the state map. C stores
   * the firer's globally unique `usrnum` (GEMAIN.H:340) and indexes the terminal
   * table with it, so it can only ever name the ship that actually fired.
   */
  it('credits the ship that actually fired, not another pilot who shares its shipno', async () => {
    // Both pilots are flying their first ship — shipno 1, as almost everyone is.
    // Bystander is listed FIRST so a shipno-based scan would return them.
    const bystander = makeShip({ userid: 'bystander', shipno: 1, channel: 4, xcoord: 0, ycoord: 0, kills: 0 });
    const shooter = makeShip({ userid: 'shooter', shipno: 1, channel: 5, xcoord: 0, ycoord: 0, kills: 0 });
    const victim = makeShip({
      userid: 'victim', shipno: 1, channel: 6, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0,
      damage: 95,
      lmisslChannel: [5, 255, 255],   // shooter's CHANNEL, not their shipno
      lmisslDistance: [10, 0, 0],
      // Full charge: a missile's damage is now normalised against
      // MISSILE_CHARGE_MAX, so a 3000-charge missile does ~6 hull damage.
      lmisslEnergy: [50000, 0, 0],
    });

    const h = await makeHarness([bystander, shooter, victim]);
    const destroyed: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

    h.fire();

    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].attackerId).toBe(shipKey('shooter', 1));
    expect(destroyed[0].attackerUserid).toBe('shooter');
    expect(shooter.kills).toBe(1);
    expect(bystander.kills).toBe(0);
  });
});

/**
 * A collision names the body, and does so through kill resolution.
 *
 * The physics tick records `deathCause` on the ship; kill resolution is what
 * turns that into an event the mail can read. A test that builds the event by
 * hand proves the mail end and leaves THIS join uncovered — which is exactly
 * where every previous version of this bug lived, so it is asserted here.
 *
 * Canon credits nobody for a collision: `ptr->damage = 101.0` (GEFUNCS.C:887)
 * sets no `lastfired`, and killem's attribution block is guarded on
 * `who >= 0` (:1105). We credit nobody either — we just say what happened
 * instead of inventing "an unknown assailant".
 */
describe('CombatTickService — a collision is attributed to the body', () => {
  it('emits weapon "gravity" and names the planet, ignoring a stale lastfiredBy', async () => {
    const victim = makeShip({
      userid: 'usr_v', shipno: 1, channel: 3, damage: 101,
      // Shot at earlier, then flew into a planet. The planet killed them.
      lastfired: -1,
      lastfiredBy: { channel: 9, name: 'Trans-Gal #2128' },
      deathCause: { kind: 'gravity', what: 'planet 1' },
    });
    const h = await makeHarness([victim]);
    const destroyedEvents: CombatShipDestroyedEvent[] = [];
    h.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyedEvents.push(e));

    h.fire();

    expect(destroyedEvents).toHaveLength(1);
    expect(destroyedEvents[0].weapon).toBe('gravity');
    expect(destroyedEvents[0].attackerName).toBe('planet 1');
    expect(destroyedEvents[0].attackerUserid).toBeNull();
  });
});
