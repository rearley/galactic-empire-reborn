/**
 * A killer who logs off in the same tick as the kill must still be NAMED.
 *
 * Mechanism of the gap: `ShipStateService.leave()` scrubs every `lastfired`
 * pointing at a freed channel, because our channel recycling is denser than
 * canon's and a stale pointer would hand an old grudge — and its kill credit —
 * to the next occupant. Canon scrubs only on DEATH (GEFUNCS.C:1224-1225,
 * inside killem) and `warhupa` scrubs nothing on a clean disconnect
 * (GEMAIN.C:1410-1432); it simply lives with the mis-attribution. We do not.
 *
 * The cost was that the ship-loss mail read "destroyed by an unknown
 * assailant" — a visible lie in a message a player reads. The fix is to carry
 * the attacker's NAME on the victim's state at the moment damage LANDS
 * (`lastfiredBy`), so the scrub can keep protecting attribution without
 * destroying it.
 *
 * The name is only trusted when it still describes `lastfired`:
 *   • the recorded channel IS `lastfired`               → the live case
 *   • `lastfired` is NO_CHANNEL and the recorded channel is no longer held by
 *     any ship in the game                              → the scrub case
 * Anything else — above all a planet's ion cannons, which set
 * `ptr->lastfired = -1` (GEFUNCS.C:1797) while the last ship to shoot you is
 * still flying — must name nobody.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { PhaserHandlerService } from '../../../src/game/commands/handlers/phaser.handler';
import { CommandContext } from '../../../src/game/commands/command.types';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
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
    channel: over.channel ?? over.shipno ?? 1,
  };
}

function makeShipMapService(ships: ShipState[]) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
  const svc = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(u, n));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    removeFromGame: (ship: { userid: string; shipno: number }) => {
      shipMap.delete(shipKey(ship.userid, ship.shipno));
    },
  } as unknown as ShipStateService;
  return { shipMap, svc };
}

function makeClassCache(): ShipClassCacheService {
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);
  return cache;
}

async function makeCombatHarness(ships: ShipState[]) {
  const { shipMap, svc } = makeShipMapService(ships);
  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_k: TickKind, h: (c: TickContext) => void) => { subscribers.push(h); return () => {}; },
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;
  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(),
  } as unknown as MineRepository;
  const events = new EventEmitter2();
  const logger = new Logger('KillerLogoffSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const service = new CombatTickService(
    tickService, svc, mineRepo, new MineRegistry(),
    new Mulberry32Adapter(7), events, logger, makeClassCache(),
  );
  await service.onModuleInit();

  const destroyed: CombatShipDestroyedEvent[] = [];
  events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

  return {
    shipMap, destroyed,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

const ctx: CommandContext = {};

describe('attacker name survives a channel scrub', () => {
  it('a phaser hit records the firer NAME alongside lastfired on the victim', () => {
    const firer = makeShip({
      userid: 'usr_kil', shipno: 1, channel: 7, shipname: 'Marauder',
      xcoord: 0, ycoord: 5, heading: 0, phasrtype: 20,
    });
    const victim = makeShip({
      userid: 'usr_abc', shipno: 2, channel: 9, shipname: 'Defiant',
      xcoord: 5, ycoord: 5,
    });
    const { svc } = makeShipMapService([firer, victim]);
    const handler = new PhaserHandlerService(
      svc, makeClassCache(), new EventEmitter2(), new Mulberry32Adapter(42),
    );

    handler.command.handler(firer, ['90', '0'], ctx);

    expect(victim.lastfired).toBe(7);
    expect(victim.lastfiredBy).toEqual({ channel: 7, name: 'Marauder' });
  });

  it('names the killer even after their channel was scrubbed by leave()', async () => {
    // The killer fired, then logged off in the same tick: leave() set the
    // victim's lastfired back to NO_CHANNEL and the attacker is gone from the
    // map. Only `lastfiredBy` still knows who it was.
    const victim = makeShip({
      userid: 'usr_abc', shipno: 2, channel: 9, shipname: 'Defiant',
      damage: 150, lastfired: -1,
      lastfiredBy: { channel: 7, name: 'Marauder' },
    });
    const h = await makeCombatHarness([victim]);

    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].attackerName).toBe('Marauder');
  });

  it('does NOT name an old attacker when a planet made the kill', async () => {
    // fireion sets `ptr->lastfired = -1` (GEFUNCS.C:1797) while the ship that
    // last shot you is still flying. The recorded channel is still held, so the
    // name must not be trusted.
    const shooter = makeShip({ userid: 'usr_kil', shipno: 1, channel: 7, shipname: 'Marauder' });
    const victim = makeShip({
      userid: 'usr_abc', shipno: 2, channel: 9, shipname: 'Defiant',
      damage: 150, lastfired: -1,
      lastfiredBy: { channel: 7, name: 'Marauder' },
    });
    const h = await makeCombatHarness([shooter, victim]);

    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].attackerName).toBeNull();
  });

  it('a live killer is still named from the attacker itself', async () => {
    const killer = makeShip({ userid: 'usr_kil', shipno: 1, channel: 7, shipname: 'Marauder' });
    const victim = makeShip({
      userid: 'usr_abc', shipno: 2, channel: 9, shipname: 'Defiant',
      damage: 150, lastfired: 7,
    });
    const h = await makeCombatHarness([killer, victim]);

    h.fire();

    expect(h.destroyed).toHaveLength(1);
    expect(h.destroyed[0].attackerName).toBe('Marauder');
  });
});
