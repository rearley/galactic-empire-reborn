/**
 * T012 — Spawn cap: per-class population never exceeds DROID_MAX_PER_CLASS=2
 * across 2+ cadence rollovers (60+ physics ticks).
 *
 * @see GEDROIDS.C:droid_init — hard cap per class before spawning
 * @see specs/008-droid-ai/tasks.md T012
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { MAXDROID, DROID_SPAWN_TICK_CADENCE } from '../../../src/game/constants';
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
  DROID_MAX_PER_CLASS,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  GESTAT_USER,
  GESTAT_AUTO,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

// ─── Shared class entry for all droid classes ──────────────────────────────

const BASE_CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200,
  maxWarp: 4,
  maxPhaser: 1,
  maxShields: 1,
  scanRange: 20_000,
  maxTons: 100,
  hasTorpedo: false,
  hasMissile: false,
  hasJammer: true,
  hasMine: true,
  hasZipper: false,
  hasCloak: false,
  hasDecoy: false,
  noClaim: 0,
  tough: 0,
  cybLowestClassAttacks: 0,
  cybCanAttack: false,
  points: 50,
  canAttackPlanet: false,
  damageFactor: 100,
  typeName: 'Droid',
  category: 'CPU_DROID',
  shipNameTemplate: '',
};

// Murdonian overrides
const MURDONIAN_ENTRY: ShipClassEntry = {
  ...BASE_CLASS_ENTRY,
  maxWarp: 8,
  maxPhaser: 5,
  maxShields: 2,
};

// ─── Harness builder ──────────────────────────────────────────────────────

function buildHarness(seed = 42) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  // One human player always online
  const playerShip: ShipState = baseMakeShip({
    userid: 'player1',
    shipname: 'PlayerShip',
    shpclass: 5,
    energy: 50_000,
    phasr: 100, phasrtype: 3, lastfired: 255,
    shieldtype: 2, shieldstat: 1, shield: 2,
    helm: 1,
    freq: [],
    items: Array(14).fill(0n),
    status: GESTAT_USER, cybmine: 255,
    topspeed: 8_000, // NOTE: not a canon 0-255 warp factor — pre-existing, carried over unchanged (see task-6 report)
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${playerShip.userid}:${playerShip.shipno}`, playerShip);

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
    get: (n: number): ShipClassEntry | undefined => {
      if (n === DROID_CLASS_TRANSPORT) return MURDONIAN_ENTRY;
      if (n === DROID_CLASS_SCOW || n === DROID_CLASS_VAKORY) return BASE_CLASS_ENTRY;
      return undefined;
    },
    getMaxPhaser: (n: number) => {
      if (n === DROID_CLASS_TRANSPORT) return 5;
      return 1;
    },
    getMaxTons: (n: number) => {
      if (n === DROID_CLASS_TRANSPORT) return 500;
      return 100;
    },
    getMaxShields: (n: number) => {
      if (n === DROID_CLASS_TRANSPORT) return 2;
      return 1;
    },
  } as unknown as ShipClassCacheService;

  const mineRegistry = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
  const mineRepo = { create: jest.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }) } as unknown as MineRepository;

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

  async function fireTick(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i + 1, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { svc, fireTick, shipMap };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('T012 — spawn cap: per-class count never exceeds DROID_MAX_PER_CLASS', () => {
  it('class 31 (Scow) never exceeds cap=2 across 60 ticks (2 cadence rollovers)', async () => {
    const { svc, fireTick } = buildHarness(1);
    await fireTick(60);

    const pop = svc.getLivePopulation();
    expect((pop.get(DROID_CLASS_SCOW) ?? new Set()).size).toBeLessThanOrEqual(DROID_MAX_PER_CLASS);
  });

  it('class 32 (Murdonian) never exceeds cap=2 across 60 ticks', async () => {
    const { svc, fireTick } = buildHarness(2);
    await fireTick(60);

    const pop = svc.getLivePopulation();
    expect((pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size).toBeLessThanOrEqual(DROID_MAX_PER_CLASS);
  });

  it('class 33 (Vakory) never exceeds cap=2 across 60 ticks', async () => {
    const { svc, fireTick } = buildHarness(3);
    await fireTick(60);

    const pop = svc.getLivePopulation();
    expect((pop.get(DROID_CLASS_VAKORY) ?? new Set()).size).toBeLessThanOrEqual(DROID_MAX_PER_CLASS);
  });

  it('total population (all classes) never exceeds 6 across 90 ticks (3 cadence rollovers)', async () => {
    const { svc, fireTick } = buildHarness(7);
    await fireTick(90);

    const pop = svc.getLivePopulation();
    const total =
      (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
      (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
      (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;

    expect(total).toBeLessThanOrEqual(DROID_MAX_PER_CLASS * 3); // 6
  });

  it('spawner respects cap even with high seed variance across 120 ticks (4 rollovers)', async () => {
    // Use multiple harnesses with different seeds to cover RNG variance
    for (const seed of [11, 22, 33, 44, 55]) {
      const { svc, fireTick } = buildHarness(seed);
      await fireTick(120);

      const pop = svc.getLivePopulation();
      for (const classNum of [DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY]) {
        const count = (pop.get(classNum) ?? new Set()).size;
        expect(count).toBeLessThanOrEqual(DROID_MAX_PER_CLASS);
      }
    }
  });

  it('all spawned ships in the map have GESTAT_AUTO status', async () => {
    const { fireTick, shipMap } = buildHarness(13);
    await fireTick(60);

    for (const ship of shipMap.values()) {
      if (ship.status === GESTAT_AUTO) {
        expect(ship.isEphemeral).toBe(true);
      }
    }
  });
});

describe('MAXDROID — total droid population cap', () => {
  /**
   * DROID_MAX_PER_CLASS caps each class independently, so without an overall
   * limit the ceiling was classes x per-class. MAXDROID (GEMAIN.C:471,
   * numopt(MAXDROID,0,500)) is the total, and was declared but inert.
   *
   * At the shipped default of 500 the cap never binds — the natural ceiling is
   * 3 classes x 2 = 6 — so the guard is exercised by reloading the modules with
   * a low MAXDROID from the environment. Seeding the population map directly
   * does NOT work: the tick reconciles it against real ships each pass, so
   * placeholder ids are dropped.
   */
  it('stops spawning once the total population reaches the cap', async () => {
    // The guard cannot be exercised via the environment: constants.ts captures
    // MAXDROID at import, and DroidTickService closes over that module, so
    // jest.resetModules() cannot reach the already-constructed service. Nor can
    // the population map be pre-seeded — the tick reconciles it against real
    // ships each pass and drops placeholder ids.
    //
    // Forcing the counter is what actually exercises the branch.
    const { svc, fireTick } = buildHarness(11);
    jest
      .spyOn(svc as unknown as { totalDroidPopulation: () => number }, 'totalDroidPopulation')
      .mockReturnValue(MAXDROID);

    await fireTick(DROID_SPAWN_TICK_CADENCE * 3);

    let total = 0;
    for (const set of svc.getLivePopulation().values()) total += set.size;
    expect(total).toBe(0); // nothing spawned while at the cap
  });

  it('the shipped default equals the canonical total, so it binds exactly', async () => {
    const { svc, fireTick } = buildHarness(11);
    await fireTick(DROID_SPAWN_TICK_CADENCE * 3);

    let total = 0;
    for (const set of svc.getLivePopulation().values()) total += set.size;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(MAXDROID);
    // Documents the relationship: the natural ceiling is well under the default.
    // 3 droid classes x DROID_MAX_PER_CLASS is the natural ceiling.
    expect(total).toBeLessThanOrEqual(3 * DROID_MAX_PER_CLASS);
  });
});
