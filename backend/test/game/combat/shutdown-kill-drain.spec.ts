/**
 * A kill in flight when the server stops must not survive the restart.
 *
 * `runKillResolution` kills a ship on the PHYSICS tick once `damage >= 100`,
 * so there is a window of up to six seconds between the damage landing and the
 * kill being resolved. `damage` is a persisted column; the attacker's identity
 * is NOT — `attackerSnapshot` is rebuilt per tick and `lastfiredBy` has no
 * column at all, while `lastfired` holds a CHANNEL number that means nothing
 * after a restart.
 *
 * So a deploy inside that window left a corpse walking: the hull flushed to
 * Postgres at damage >= 100, and the first physics tick after boot killed it
 * with `attacker=none`. `resolveKillSpoils` never runs without an attacker, so
 * the kill, the score and the entire hold are lost rather than transferred.
 *
 * Observed in production 2026-09-08, and this is the manifest it left:
 *
 *   ship destroyed: victim=Cybrg-222:222 attacker=none cause=unknown
 *   sector=(-62,98) name='SOBx949345' class=25(Sarten Obliterator)
 *   cargo=[torpedos=22 decoys=20 jammers=86 mines=59 gold=1146]
 *
 * 1,146 gold, and nobody got it. The fix is to settle those kills during
 * shutdown, while the attacker is still in memory — canon has no equivalent
 * because canon's server did not redeploy underneath a fight.
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
import { COMBAT_SHIP_DESTROYED, CombatShipDestroyedEvent } from '../../../src/game/combat/combat-events';

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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  };
}

async function makeHarness(ships: ShipState[]) {
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

  const tickService = {
    subscribe: () => () => {},
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(), delete: jest.fn(),
  } as unknown as MineRepository;

  const events = new EventEmitter2();
  const logger = new Logger('ShutdownDrainSpec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, new MineRegistry(),
    new Mulberry32Adapter(1), events, logger, classCache,
  );
  await service.onModuleInit();
  return { service, shipMap, events };
}

describe('CombatTickService — settling kills at shutdown', () => {
  /** A victim already past 100 damage, shot by an attacker still in memory. */
  const staged = () => {
    const killer = makeShip({ userid: 'usr_hunter', shipno: 7, kills: 0 });
    const victim = makeShip({
      userid: 'Cybrg-222', shipno: 222, shipname: 'SOBx949345',
      damage: 104, lastfired: 7, status: 2,
    });
    return { killer, victim };
  };

  it('kills a ship that is already past 100 damage', async () => {
    const { killer, victim } = staged();
    const { service, shipMap } = await makeHarness([killer, victim]);

    await service.beforeApplicationShutdown();

    expect(shipMap.has(shipKey('Cybrg-222', 222))).toBe(false);
  });

  it('credits the attacker, who is still in memory only until we stop', async () => {
    const { killer, victim } = staged();
    const { service, events } = await makeHarness([killer, victim]);

    const seen: CombatShipDestroyedEvent[] = [];
    events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => { seen.push(e); });

    await service.beforeApplicationShutdown();

    expect(seen).toHaveLength(1);
    // The whole point: attacker=none is what the restart produced.
    expect(seen[0]?.attackerUserid).toBe('usr_hunter');
    expect(seen[0]?.attackerShipKey).toBe('usr_hunter:7');
  });

  it('waits for the listeners\' database work before letting the process exit', async () => {
    // The hull DELETE is fire-and-forget on the live path. At shutdown that is
    // the whole bug: if the process exits first the row survives at damage>=100
    // and the next boot re-kills it with nobody to credit.
    const { killer, victim } = staged();
    const { service, events } = await makeHarness([killer, victim]);

    let settled = false;
    events.on(COMBAT_SHIP_DESTROYED, async () => {
      await new Promise((r) => setTimeout(r, 30));
      settled = true;
    });

    await service.beforeApplicationShutdown();

    expect(settled).toBe(true);
  });

  it('leaves an undamaged ship alone', async () => {
    const healthy = makeShip({ userid: 'usr_fine', shipno: 3, damage: 12 });
    const { service, shipMap, events } = await makeHarness([healthy]);
    const seen: unknown[] = [];
    events.on(COMBAT_SHIP_DESTROYED, (e) => { seen.push(e); });

    await service.beforeApplicationShutdown();

    expect(seen).toHaveLength(0);
    expect(shipMap.has(shipKey('usr_fine', 3))).toBe(true);
  });
});
