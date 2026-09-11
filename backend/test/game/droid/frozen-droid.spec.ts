/**
 * Dev-only "stationary" droids must STAY stationary.
 *
 * The spawner honours `stationary` at creation (droid-spawner.ts speed2b = 0),
 * but canon has the droid roll a fresh drift speed the moment it detects a
 * player: GEDROIDS.C:328-331
 *
 *     if (ddist < (double)shipclass[ptr->shpclass].scanrange)
 *         {
 *         if (ptr->holdcourse == 0)
 *             ptr->speed2b = rndm(999.9);
 *
 * That is canon and must not change for normal play. What must change is the
 * DEV OVERRIDE: a droid spawned stationary for a playtest is registered as
 * frozen, and the tick re-zeroes its speed after the AI has run, so phaser
 * range (falloff dd^PFIRDST, shipped at 5) is a controlled variable across an
 * engagement. Nothing on the normal spawn path can set the flag.
 */

import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import {
  DROID_CLASS_TRANSPORT,
  DROID_SPAWN_TICK_CADENCE,
  GESTAT_USER,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';

const TRANSPORT_CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 3, maxPhaser: 5, maxShields: 2,
  scanRange: 25_000, maxTons: 30_000, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100,
  typeName: 'Murdonian Transport',
  category: 'CPU_DROID', shipNameTemplate: 'Trans-Gal #',
};

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'test', shipno: 1, shipname: 'Test', shpclass: 31,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 1, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 2, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 1, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 3, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    isEphemeral: true,
    ...overrides,
  };
}

function buildHarness(seed = 42) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const shipMap = new Map<string, ShipState>();

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    findByName: (n: string) =>
      Array.from(shipMap.values()).find((e) => e.shipname.toLowerCase() === n.toLowerCase()),
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) =>
      shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (_n: number): ShipClassEntry => TRANSPORT_CLASS_ENTRY,
    getMaxPhaser: () => 5,
    getMaxTons: () => 30_000,
    getMaxShields: () => 2,
  } as unknown as ShipClassCacheService;

  const mineRegistry = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
  const mineRepo = { create: jest.fn().mockResolvedValue({}) } as unknown as MineRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => { subscribed.push(fn); return () => {}; },
  } as unknown as TickService;

  const spawner = new DroidSpawner(shipState, classCache, rand);
  const svc = new DroidTickService(
    tickService, shipState, classCache, spawner, mineRegistry, mineRepo, events, rand,
  );
  void svc.onModuleInit();

  // A player parked right next to the spawn point, well inside scanRange, so
  // the detection branch (GEDROIDS.C:328) fires on the very first droid tick.
  shipMap.set('player1:1', makeShip({
    userid: 'player1', shipname: 'Player', status: GESTAT_USER,
    xcoord: 1.01, ycoord: 1, isEphemeral: undefined,
  }));

  async function fireTicks(n: number): Promise<void> {
    for (let i = 1; i <= n; i++) {
      for (const fn of subscribed) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { svc, spawner, shipMap, fireTicks };
}

describe('DroidSpawner/DroidTickService — dev-only frozen droid', () => {
  it('a droid spawned stationary is still stationary after a detection tick', async () => {
    const { svc, spawner, shipMap, fireTicks } = buildHarness(42);

    const droid = spawner.spawn(
      DROID_CLASS_TRANSPORT, svc.getLivePopulation(), { x: 1, y: 1 }, true, 'FrozenTarget',
    )!;
    expect(droid.speed2b).toBe(0);

    // One full spawn cadence of ticks — far more than the droid's own
    // countdown (tick = CYBTICKTIME + rnd) needs to act at least once.
    await fireTicks(DROID_SPAWN_TICK_CADENCE);

    const after = shipMap.get(`${droid.userid}:1`)!;
    expect(after.speed2b).toBe(0);
    expect(after.speed).toBe(0);
  });

  it('a normally spawned droid still rolls a drift speed on detection (canon)', async () => {
    const { svc, spawner, shipMap, fireTicks } = buildHarness(42);

    const droid = spawner.spawn(
      DROID_CLASS_TRANSPORT, svc.getLivePopulation(), { x: 1, y: 1 }, false, 'CanonTarget',
    )!;
    droid.speed2b = 0; // start from rest so any change is unambiguously the roll

    await fireTicks(DROID_SPAWN_TICK_CADENCE);

    const after = shipMap.get(`${droid.userid}:1`)!;
    expect(after.speed2b).toBeGreaterThan(0);
  });

  it('the freeze flag is never set by the normal (no-argument) spawn path', () => {
    const { svc, spawner } = buildHarness(42);
    const droid = spawner.spawn(DROID_CLASS_TRANSPORT, svc.getLivePopulation())!;
    expect(spawner.isFrozen(droid.userid, droid.shipno)).toBe(false);
  });

  it('freezing is per-droid: a frozen droid does not freeze its neighbours', async () => {
    const { svc, spawner, shipMap, fireTicks } = buildHarness(42);

    const frozen = spawner.spawn(
      DROID_CLASS_TRANSPORT, svc.getLivePopulation(), { x: 1, y: 1 }, true, 'Frozen',
    )!;
    const free = spawner.spawn(
      DROID_CLASS_TRANSPORT, svc.getLivePopulation(), { x: 1, y: 1 }, false, 'Free',
    )!;
    free.speed2b = 0;

    await fireTicks(DROID_SPAWN_TICK_CADENCE);

    expect(shipMap.get(`${frozen.userid}:1`)!.speed2b).toBe(0);
    expect(shipMap.get(`${free.userid}:1`)!.speed2b).toBeGreaterThan(0);
  });

  it('a normal spawn CLEARS a stale freeze on the userid it reclaims', () => {
    // allocateUserid walks nextSlotIndex and wraps at 9999, so a dev-frozen
    // slot really can come back round to a live droid. This is the `else
    // { this.frozen.delete(...) }` arm in droid-spawner.ts; without winding the
    // counter back, the second spawn simply gets a DIFFERENT userid and the
    // test proves nothing -- which is what the first version of it did.
    const { svc, spawner } = buildHarness(42);
    const pop = svc.getLivePopulation();
    const counter = spawner as unknown as { nextSlotIndex: number };

    const slotBefore = counter.nextSlotIndex;
    const frozen = spawner.spawn(DROID_CLASS_TRANSPORT, pop, { x: 1, y: 1 }, true, 'A')!;
    expect(spawner.isFrozen(frozen.userid, 1)).toBe(true);

    // Free the slot and rewind the allocator so the next spawn MUST reclaim
    // the same userid. The freeze is deliberately left in place.
    pop.get(DROID_CLASS_TRANSPORT)!.delete(frozen.userid);
    counter.nextSlotIndex = slotBefore;

    const reused = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), undefined, undefined, 'B')!;
    expect(reused.userid).toBe(frozen.userid);
    expect(spawner.isFrozen(reused.userid, 1)).toBe(false);
  });
});
