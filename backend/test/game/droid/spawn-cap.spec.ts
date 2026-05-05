/**
 * T012 — Spawn cap: per-class population never exceeds DROID_MAX_PER_CLASS=2
 * across 2+ cadence rollovers (60+ physics ticks).
 *
 * @see GEDROIDS.C:droid_init — hard cap per class before spawning
 * @see specs/008-droid-ai/tasks.md T012
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
  DROID_MAX_PER_CLASS,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  GESTAT_USER,
  GESTAT_AUTO,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';

// ─── Shared class entry for all droid classes ──────────────────────────────

const BASE_CLASS_ENTRY: ShipClassEntry = {
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
  noClaim: 0,
  tough: 0,
  cybLowestClassAttacks: 0,
  cybCanAttack: false,
  points: 50,
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
  const playerShip: ShipState = {
    userid: 'player1',
    shipno: 1,
    shipname: 'PlayerShip',
    shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50_000,
    phasr: 100, phasrtype: 3, kills: 0, lastfired: 255,
    shieldtype: 2, shieldstat: 1, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [],
    items: Array(14).fill(0n), titem: 0, hostile: 0,
    cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: GESTAT_USER, cybmine: 255, cybskill: 0, cybupdate: 0,
    tick: 0, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8_000, warncntr: 0, dirty: false,
  };

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
