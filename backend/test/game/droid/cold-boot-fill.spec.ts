/**
 * T042 — SC-001 cold-boot fill: from empty population with ≥1 player online,
 * population reaches cap=2 per class (total 6) within 2 spawn-cadence rollovers
 * (60 physics ticks).
 *
 * First rollover at tick 30: spawns 1 per class (total 3, cap=2 allows one more each).
 * Second rollover at tick 60: spawns 1 more per class (total 6, cap reached).
 *
 * @see GEDROIDS.C:droid_init — spawn one per class below cap per cadence rollover
 * @see specs/008-droid-ai/tasks.md T042
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
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_MAX_PER_CLASS,
  GESTAT_USER,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import { canonMaxWarp } from '../../helpers/canon-max-warp';

// ─── Helper ───────────────────────────────────────────────────────────────────

const BASE_CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: 20_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', category: 'CPU_DROID', shipNameTemplate: '',
};

function buildHarness(seed = 42) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const playerShip: ShipState = baseMakeShip({
    userid: 'player1', shipname: 'PlayerShip', shpclass: 5,
    energy: 50_000,
    phasr: 100, phasrtype: 3, lastfired: 255,
    shieldtype: 2, shieldstat: 1, shield: 2,
    helm: 1,
    freq: [],
    items: Array(14).fill(0n) as bigint[],
    status: GESTAT_USER, cybmine: 255,
    topspeed: canonMaxWarp(5),
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set('player1:1', playerShip);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) =>
      shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (n: number): ShipClassEntry => {
      if (n === DROID_CLASS_TRANSPORT) {
        return { ...BASE_CLASS_ENTRY, maxWarp: 8, maxPhaser: 5, maxShields: 2 };
      }
      return BASE_CLASS_ENTRY;
    },
    getMaxPhaser: (n: number) => n === DROID_CLASS_TRANSPORT ? 5 : 1,
    getMaxTons: (n: number) => n === DROID_CLASS_TRANSPORT ? 500 : 100,
    getMaxShields: (n: number) => n === DROID_CLASS_TRANSPORT ? 2 : 1,
  } as unknown as ShipClassCacheService;

  const mineRegistry = { add: vi.fn(), hydrate: vi.fn() } as unknown as MineRegistry;
  const mineRepo = {
    create: vi.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }),
  } as unknown as MineRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const spawner = new DroidSpawner(shipState, classCache, rand);
  const svc = new DroidTickService(
    tickService, shipState, classCache, spawner, mineRegistry, mineRepo, events, rand,
  );
  void svc.onModuleInit();

  async function fireTicks(n: number): Promise<void> {
    for (let i = 1; i <= n; i++) {
      for (const fn of subscribed) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { svc, fireTicks };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T042 — SC-001 cold-boot fill: population reaches cap within 2 cadence rollovers (60 ticks)', () => {
  it('after 60 physics ticks, class 31 (Scow) has size === DROID_MAX_PER_CLASS (2)', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(60);

    const pop = svc.getLivePopulation();
    expect(pop.get(DROID_CLASS_SCOW)!.size).toBe(DROID_MAX_PER_CLASS);
  });

  it('after 60 physics ticks, class 32 (Murdonian) has size === DROID_MAX_PER_CLASS (2)', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(60);

    const pop = svc.getLivePopulation();
    expect(pop.get(DROID_CLASS_TRANSPORT)!.size).toBe(DROID_MAX_PER_CLASS);
  });

  it('after 60 physics ticks, class 33 (Vakory) has size === DROID_MAX_PER_CLASS (2)', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(60);

    const pop = svc.getLivePopulation();
    expect(pop.get(DROID_CLASS_VAKORY)!.size).toBe(DROID_MAX_PER_CLASS);
  });

  it('after 60 physics ticks, total population === 6 (cap for all 3 classes)', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(60);

    const pop = svc.getLivePopulation();
    const total =
      (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
      (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
      (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;

    expect(total).toBe(DROID_MAX_PER_CLASS * 3); // 6
  });

  it('after only 30 physics ticks (1 rollover), each class has exactly 1 Droid', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(30);

    const pop = svc.getLivePopulation();
    // After first rollover: 1 per class (cap=2 but only 1 spawned per rollover)
    expect((pop.get(DROID_CLASS_SCOW) ?? new Set()).size).toBe(1);
    expect((pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size).toBe(1);
    expect((pop.get(DROID_CLASS_VAKORY) ?? new Set()).size).toBe(1);
  });

  it('population does not exceed 6 after 90 ticks (cap holds on 3rd rollover)', async () => {
    const { svc, fireTicks } = buildHarness(42);
    await fireTicks(90);

    const pop = svc.getLivePopulation();
    const total =
      (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
      (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
      (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;

    expect(total).toBeLessThanOrEqual(DROID_MAX_PER_CLASS * 3);
  });
});
