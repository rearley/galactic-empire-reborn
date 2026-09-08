/**
 * Boot-seed tests — verify that onModuleInit fills the Cybertron population to
 * tot_to_create at startup instead of waiting ~70 minutes for the per-slot cadence.
 *
 * @see backend/src/game/cybertron/cybertron-tick.service.ts onModuleInit
 * @see backend/src/game/cybertron/cybertron.config.ts bootSeedEnabled
 * @see specs/024-ai-presence/plan.md Task 3
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CYBERTRON_CLASS_DEFAULTS } from '../../../src/game/cybertron/cybertron.config';

/** Total AI hulls the config asks for, whatever the galaxy size scales it to. */
function expectedTotal(): number {
  return Object.values(CYBERTRON_CLASS_DEFAULTS)
    .reduce((sum, cfg) => sum + cfg.tot_to_create, 0);
}

// ─── Minimal AI ship factory ──────────────────────────────────────────────────

function makeAiShip(
  overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number },
): ShipState {
  return {
    shipname: `Cybrg-${overrides.shipno}`,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5,
    damage: 0, energy: 50000, phasr: 100, phasrtype: 1,
    kills: 0, lastfired: 255,
    shieldtype: 1, shieldstat: 1, shield: 1,
    cloak: 0, degrees: 0, percent: 0,
    tactical: 0, helm: 1, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: 2, cybmine: 255, cybskill: 10, cybupdate: 50, tick: 6,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

// ─── Harness builder ──────────────────────────────────────────────────────────

/**
 * @param seed         PRNG seed for deterministic spawns
 * @param existingAiShips  ships already in the in-memory map (simulate hydrateAll output)
 */
function buildHarness(
  seed = 1,
  existingAiShips: Array<Partial<ShipState> & { userid: string; shipno: number; shpclass: number }> = [],
) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();
  const shipMap = new Map<string, ShipState>();

  // Pre-populate to simulate ships already loaded by hydrateAll
  for (const partial of existingAiShips) {
    const ship = makeAiShip(partial);
    shipMap.set(`${ship.userid}:${ship.shipno}`, ship);
  }

  const shipStateService = {
    findAllShips: () => Array.from(shipMap.values()),
    findByUserid: (uid: string) => Array.from(shipMap.values()).filter((s) => s.userid === uid),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classCache = new Map<number, ReturnType<ShipClassCacheService['get']>>();
  const shipClassCache = {
    get: (n: number) => classCache.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895); a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    getMaxPhaser: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxPhaser; },
    getMaxTons: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxTons; },
    setClass: (n: number, e: ReturnType<ShipClassCacheService['get']>) => classCache.set(n, e),
  } as unknown as ShipClassCacheService & { setClass: (n: number, e: unknown) => void };

  // Register all 5 AI classes in the cache
  for (const classNumStr of Object.keys(CYBERTRON_CLASS_DEFAULTS)) {
    const n = Number(classNumStr);
    (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(n, {
      maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
      scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
      hasJammer: true, hasMine: true, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
    });
  }

  const createdSpawns: Array<{ classNumber: number; userid: string; shipno: number }> = [];
  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn().mockImplementation(
      async (slot: { userid: string; shipno: number; classNumber: number; tick: number }) => {
        createdSpawns.push({ classNumber: slot.classNumber, userid: slot.userid, shipno: slot.shipno });
        const ship = makeAiShip({
          userid: slot.userid, shipno: slot.shipno, shpclass: slot.classNumber, tick: slot.tick,
        });
        shipMap.set(`${slot.userid}:${slot.shipno}`, ship);
      },
    ),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n > 2_000_000n ? 2_000_000n : n,
  } as unknown as CybertronRepository;

  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      void fn; // suppress unused warning
      return () => {};
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );

  const spawnCountForClass = (cls: number) =>
    createdSpawns.filter((s) => s.classNumber === cls).length;
  const totalSpawns = () => createdSpawns.length;

  return { svc, repository, createdSpawns, spawnCountForClass, totalSpawns };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Boot-seed (Plan 2 T3) — onModuleInit fills Cybertron population at startup', () => {
  const origBootSeed = process.env.CYBERTRON_BOOT_SEED;

  afterEach(() => {
    // Restore env after each test so disabled-test doesn't bleed
    if (origBootSeed === undefined) {
      delete process.env.CYBERTRON_BOOT_SEED;
    } else {
      process.env.CYBERTRON_BOOT_SEED = origBootSeed;
    }
  });

  it('boot-seeds each class up to tot_to_create when the galaxy is empty', async () => {
    // Arrange: empty galaxy, boot seed enabled (default)
    delete process.env.CYBERTRON_BOOT_SEED;
    const { svc, spawnCountForClass, totalSpawns } = buildHarness(1);

    // Act
    await svc.onModuleInit();

    // Assert: every class filled to ITS OWN tot_to_create, read from the config
    // rather than transcribed. These used to be the literals 10/5/1/6/2 = 24,
    // canon's counts, which made a boot-seeding test fail whenever the
    // POPULATION was retuned — a fact about the galaxy's size, not about
    // whether onModuleInit tops up correctly. The actual numbers are pinned in
    // test/unit/cyb-population.spec.ts, which is where that belongs.
    for (const [cls, cfg] of Object.entries(CYBERTRON_CLASS_DEFAULTS)) {
      expect(spawnCountForClass(Number(cls))).toBe(cfg.tot_to_create);
    }
    expect(totalSpawns()).toBe(expectedTotal());
  });

  it('tops up only the deficit when some Cybertrons already exist', async () => {
    // Arrange: 3 class-21 ships already present in memory (simulates partial-hydration)
    delete process.env.CYBERTRON_BOOT_SEED;
    // Sized from the cap, not fixed at 3: with class 21 scaled down to 3 hulls
    // a hardcoded 3 is a FULL class, and "top up only the deficit" stops being
    // the thing under test. One short of capacity always leaves exactly one.
    const existing = Array.from(
      { length: Math.max(0, CYBERTRON_CLASS_DEFAULTS[21].tot_to_create - 1) },
      (_, i) => ({ userid: `Cybrg-${200 + i}`, shipno: 200 + i, shpclass: 21 }),
    );
    const { svc, spawnCountForClass, totalSpawns } = buildHarness(2, existing);

    // Act
    await svc.onModuleInit();

    // Assert: class 21 topped up by its DEFICIT only, every other class filled.
    const deficit21 = CYBERTRON_CLASS_DEFAULTS[21].tot_to_create - existing.length;
    expect(spawnCountForClass(21)).toBe(deficit21);
    for (const [cls, cfg] of Object.entries(CYBERTRON_CLASS_DEFAULTS)) {
      if (Number(cls) === 21) continue;
      expect(spawnCountForClass(Number(cls))).toBe(cfg.tot_to_create);
    }
    expect(totalSpawns()).toBe(expectedTotal() - existing.length);
  });

  it('does nothing when CYBERTRON_BOOT_SEED is disabled', async () => {
    // Arrange: boot seed disabled via env
    process.env.CYBERTRON_BOOT_SEED = 'false';
    const { svc, totalSpawns } = buildHarness(3);

    // Act
    await svc.onModuleInit();

    // Assert: no spawns at all
    expect(totalSpawns()).toBe(0);
  });
});
