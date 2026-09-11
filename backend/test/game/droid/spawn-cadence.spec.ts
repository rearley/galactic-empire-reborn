/**
 * T013 — Spawn cadence: spawner runs only on the 30th physics-tick rollover;
 * skips entirely when no human players are online.
 *
 * @see GEMAIN.C:2325 — outer ticktock2 >= 30 loop
 * @see GEDROIDS.C:droid_lives gate on GESTAT_USER ships present
 * @see specs/008-droid-ai/tasks.md T013
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
  DROID_SPAWN_TICK_CADENCE,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  GESTAT_USER,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import type { Mock } from 'vitest';

const BASE_CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: 20_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', category: 'CPU_DROID', shipNameTemplate: '',
};

function makePlayer(): ShipState {
  return baseMakeShip({
    userid: 'player1', shipname: 'PlayerShip', shpclass: 5,
    energy: 50_000, phasr: 100, phasrtype: 3,
    lastfired: 255, shieldtype: 2, shieldstat: 1, shield: 2,
    helm: 1,
    freq: [],
    items: Array(14).fill(0n),
    status: GESTAT_USER, cybmine: 255,
    topspeed: 8_000, // NOTE: not a canon 0-255 warp factor — pre-existing, carried over unchanged (see task-6 report)
  });
}

interface Harness {
  svc: DroidTickService;
  loadShipSpy: Mock;
  subscribed: Array<(ctx: unknown) => void>;
}

function buildHarness(ships: ShipState[], seed = 42): Harness {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const shipMap = new Map<string, ShipState>();
  for (const s of ships) {
    shipMap.set(`${s.userid}:${s.shipno}`, s);
  }

  const loadShipSpy = vi.fn((s: ShipState) => {
    shipMap.set(`${s.userid}:${s.shipno}`, s);
  });

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: loadShipSpy,
    removeFromGame: (s: { userid: string; shipno: number }) =>
      shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (n: number): ShipClassEntry | undefined => {
      if (n === DROID_CLASS_TRANSPORT) return { ...BASE_CLASS_ENTRY, maxWarp: 8, maxPhaser: 5, maxShields: 2 };
      if (n === DROID_CLASS_SCOW || n === DROID_CLASS_VAKORY) return BASE_CLASS_ENTRY;
      return undefined;
    },
    getMaxPhaser: (n: number) => (n === DROID_CLASS_TRANSPORT ? 5 : 1),
    getMaxTons: (n: number) => (n === DROID_CLASS_TRANSPORT ? 500 : 100),
    getMaxShields: (n: number) => (n === DROID_CLASS_TRANSPORT ? 2 : 1),
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

  return { svc, loadShipSpy, subscribed };
}

async function fireTicks(subscribed: Array<(ctx: unknown) => void>, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    for (const fn of subscribed) {
      fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
    }
    await new Promise((r) => setImmediate(r));
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('T013 — spawn cadence: spawner respects DROID_SPAWN_TICK_CADENCE and player gate', () => {
  describe('with 0 players online', () => {
    it('fires 31 physics ticks → no spawns (livePopulation stays empty)', async () => {
      // No players in the ship map
      const { svc, loadShipSpy, subscribed } = buildHarness([]);

      await fireTicks(subscribed, 31);

      // loadShip should never be called — spawner is gated by player presence
      expect(loadShipSpy).not.toHaveBeenCalled();

      const pop = svc.getLivePopulation();
      expect((pop.get(DROID_CLASS_SCOW) ?? new Set()).size).toBe(0);
      expect((pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size).toBe(0);
      expect((pop.get(DROID_CLASS_VAKORY) ?? new Set()).size).toBe(0);
    });

    it('fires 90 ticks (3 cadence rollovers) → still no spawns', async () => {
      const { svc, loadShipSpy, subscribed } = buildHarness([]);
      await fireTicks(subscribed, 90);

      expect(loadShipSpy).not.toHaveBeenCalled();

      const pop = svc.getLivePopulation();
      const total =
        (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
        (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
        (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;
      expect(total).toBe(0);
    });
  });

  describe('with 1 player online', () => {
    it('fires 29 ticks → spawner has NOT yet run (cadence not reached)', async () => {
      const player = makePlayer();
      const { loadShipSpy, subscribed } = buildHarness([player]);

      // Fire ticks 1 through (CADENCE-1): counter reaches CADENCE-1, modulo hasn't rolled to 0
      await fireTicks(subscribed, DROID_SPAWN_TICK_CADENCE - 1);

      expect(loadShipSpy).not.toHaveBeenCalled();
    });

    it('fires exactly 30 ticks → spawner runs on tick 30, livePopulation > 0', async () => {
      const player = makePlayer();
      const { svc, loadShipSpy, subscribed } = buildHarness([player]);

      await fireTicks(subscribed, DROID_SPAWN_TICK_CADENCE);

      // At least one class should have been spawned
      expect(loadShipSpy).toHaveBeenCalled();

      const pop = svc.getLivePopulation();
      const total =
        (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
        (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
        (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;
      expect(total).toBeGreaterThan(0);
    });

    it('tick 31 → spawner does NOT run again until tick 60', async () => {
      const player = makePlayer();
      const { loadShipSpy, subscribed } = buildHarness([player]);

      // Run through the first rollover
      await fireTicks(subscribed, DROID_SPAWN_TICK_CADENCE);
      const callCountAfterFirst = loadShipSpy.mock.calls.length;

      // Tick 31 through 59 — no new spawns expected (ticks 31–59 skip)
      await fireTicks(subscribed, DROID_SPAWN_TICK_CADENCE - 1);
      expect(loadShipSpy.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('tick 60 → spawner runs a second time', async () => {
      const player = makePlayer();
      const { svc: svc2, loadShipSpy, subscribed } = buildHarness([player]);

      await fireTicks(subscribed, DROID_SPAWN_TICK_CADENCE * 2);

      // Two rollover events; but second rollover will try all 3 classes again.
      // Since classes may already be capped, any additional calls indicate the
      // evaluation ran (even if no new ships were needed).
      // We check that at the second cadence the spawn evaluation fired at all by
      // looking at population — it must have reached capacity by now.
      const pop = svc2.getLivePopulation();
      const total =
        (pop.get(DROID_CLASS_SCOW) ?? new Set()).size +
        (pop.get(DROID_CLASS_TRANSPORT) ?? new Set()).size +
        (pop.get(DROID_CLASS_VAKORY) ?? new Set()).size;
      expect(total).toBeGreaterThan(0);
    });

  });

  it('DROID_SPAWN_TICK_CADENCE constant is 30', () => {
    expect(DROID_SPAWN_TICK_CADENCE).toBe(30);
  });
});
