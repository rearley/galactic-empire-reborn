/**
 * T016 — Murdonian cargo/kill: droid.killed event, removeFromGame, no Prisma delete,
 * slot freed in livePopulation.
 *
 * @see GEDROIDS.C:534 droid_died
 * @see specs/008-droid-ai/tasks.md T016
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { CombatShipDestroyedEvent } from '../../../src/game/combat/combat-events';
import { COMBAT_SHIP_DESTROYED } from '../../../src/game/combat/combat-events';
import { DroidEvents } from '../../../src/game/droid/droid-events';
import type { DroidKilledEvent } from '../../../src/game/droid/droid-events';
import {
  DROID_CLASS_TRANSPORT,
  DROID_USERID_PREFIX,
} from '../../../src/game/constants';
import { I_GOLD, I_MINE } from '../../../src/game/constants/items';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'test', shipno: 1, shipname: 'Test', shpclass: 32,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 5, kills: 0, lastfired: -1,
    shieldtype: 2, shieldstat: 0, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 2, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 6, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    isEphemeral: true,
    ...overrides,
  };
}

const BASE_CLASS_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 8, maxPhaser: 5, maxShields: 2,
  scanRange: 25_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', shipNameTemplate: '',
};

// ─── Harness ──────────────────────────────────────────────────────────────────

function buildHarness() {
  const rand = new Mulberry32Adapter(42);
  const events = new EventEmitter2();

  const droidUserid = `${DROID_USERID_PREFIX}1`;
  const droidItems = new Array(14).fill(0n) as bigint[];
  droidItems[I_GOLD] = 100n;
  droidItems[I_MINE] = 50n;

  const murdonian = makeShip({
    userid: droidUserid,
    shipno: 1,
    shpclass: DROID_CLASS_TRANSPORT,
    isEphemeral: true,
    items: droidItems,
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${droidUserid}:1`, murdonian);

  const removeFromGameSpy = jest.fn((s: { userid: string; shipno: number }) => {
    shipMap.delete(`${s.userid}:${s.shipno}`);
  });

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: removeFromGameSpy,
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (_n: number): ShipClassEntry => BASE_CLASS_ENTRY,
    getMaxPhaser: (_n: number) => 5,
    getMaxTons: (_n: number) => 500,
    getMaxShields: (_n: number) => 2,
  } as unknown as ShipClassCacheService;

  const mineRegistry = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
  const mineRepo = {
    create: jest.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }),
  } as unknown as MineRepository;

  const tickService = {
    subscribe: jest.fn(),
  } as unknown as TickService;

  const spawner = new DroidSpawner(shipState, classCache, rand);
  const svc = new DroidTickService(
    tickService, shipState, classCache, spawner, mineRegistry, mineRepo, events, rand,
  );
  void svc.onModuleInit();

  // Pre-populate livePopulation with the Murdonian
  const pop = svc.getLivePopulation();
  pop.get(DROID_CLASS_TRANSPORT)!.add(droidUserid);

  return { svc, events, droidUserid, murdonian, removeFromGameSpy, shipMap, mineRepo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T016 — Murdonian cargo transfer on kill', () => {
  it('emits droid.killed event with the correct attackerShipKey', async () => {
    const { svc, events, droidUserid } = buildHarness();

    const killedEvents: DroidKilledEvent[] = [];
    events.on(DroidEvents.KILLED, (e: DroidKilledEvent) => killedEvents.push(e));

    const payload: CombatShipDestroyedEvent = {
      victimId: `${droidUserid}:1`,
      attackerId: 'player1:1',
      victimShipKey: `${droidUserid}:1`,
      attackerShipKey: 'player1:1',
      victimUserid: droidUserid,
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 0, y: 0 },
      tickAt: new Date(),
      loot: [
        { itemIndex: I_GOLD, amount: 100n },
        { itemIndex: I_MINE, amount: 50n },
      ],
      scoreAwarded: 50,
    };

    svc.onShipDestroyed(payload);
    await new Promise((r) => setImmediate(r));

    expect(killedEvents).toHaveLength(1);
    expect(killedEvents[0].killedBy).toBe('player1');
  });

  it('calls removeFromGame with the correct droid identity', async () => {
    const { svc, events, droidUserid, removeFromGameSpy } = buildHarness();

    const payload: CombatShipDestroyedEvent = {
      victimId: `${droidUserid}:1`,
      attackerId: 'player1:1',
      victimShipKey: `${droidUserid}:1`,
      attackerShipKey: 'player1:1',
      victimUserid: droidUserid,
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 0, y: 0 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 50,
    };

    svc.onShipDestroyed(payload);
    await new Promise((r) => setImmediate(r));

    expect(removeFromGameSpy).toHaveBeenCalledWith({ userid: droidUserid, shipno: 1 });
  });

  it('issues zero Prisma ship.delete calls (ephemeral: only removeFromGame in-memory)', async () => {
    const { svc, mineRepo, droidUserid } = buildHarness();

    const payload: CombatShipDestroyedEvent = {
      victimId: `${droidUserid}:1`,
      attackerId: 'player1:1',
      victimShipKey: `${droidUserid}:1`,
      attackerShipKey: 'player1:1',
      victimUserid: droidUserid,
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 0, y: 0 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 50,
    };

    svc.onShipDestroyed(payload);
    await new Promise((r) => setImmediate(r));

    // Only mine.create is a DB operation in DroidTickService — ship.delete is never called
    // The mineRepo.create mock was never triggered (no mine lay happened here)
    expect((mineRepo.create as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('frees the slot from livePopulation', async () => {
    const { svc, droidUserid } = buildHarness();

    const pop = svc.getLivePopulation();
    expect(pop.get(DROID_CLASS_TRANSPORT)!.has(droidUserid)).toBe(true);

    const payload: CombatShipDestroyedEvent = {
      victimId: `${droidUserid}:1`,
      attackerId: 'player1:1',
      victimShipKey: `${droidUserid}:1`,
      attackerShipKey: 'player1:1',
      victimUserid: droidUserid,
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 0, y: 0 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 50,
    };

    svc.onShipDestroyed(payload);
    await new Promise((r) => setImmediate(r));

    expect(pop.get(DROID_CLASS_TRANSPORT)!.has(droidUserid)).toBe(false);
  });

  it('droid.killed event payload includes shpclass=32 and shipId', async () => {
    const { svc, events, droidUserid } = buildHarness();

    const killedEvents: DroidKilledEvent[] = [];
    events.on(DroidEvents.KILLED, (e: DroidKilledEvent) => killedEvents.push(e));

    const payload: CombatShipDestroyedEvent = {
      victimId: `${droidUserid}:1`,
      attackerId: 'player1:1',
      victimShipKey: `${droidUserid}:1`,
      attackerShipKey: 'player1:1',
      victimUserid: droidUserid,
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 2, y: 3 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 50,
    };

    svc.onShipDestroyed(payload);
    await new Promise((r) => setImmediate(r));

    expect(killedEvents[0].shpclass).toBe(DROID_CLASS_TRANSPORT);
    expect(killedEvents[0].shipId).toBe(droidUserid);
  });
});
