import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { GalaxyModule } from '../../src/game/galaxy/galaxy.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * G-DIV: Galaxy config-divergence integration tests.
 *
 * G-DIV-1: Boot with seed A against a fresh DB generates galaxy A.
 *          Re-boot with seed B against the same DB:
 *            - GalaxyMeta.seed remains A (persisted value wins)
 *            - Zero new writes (row counts unchanged)
 *            - Logger.warn is called with a message naming both values
 *
 * G-DIV-2: Different seeds produce structurally different planet coordinate sets.
 *
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md
 * @see GalaxyService.warnOnDivergence — emits the WARN line on config mismatch
 */

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function cleanGalaxy(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.wormhole.deleteMany(),
    prisma.planet.deleteMany(),
    prisma.sector.deleteMany(),
    prisma.galaxyMeta.deleteMany(),
  ]);
}

async function rowCounts(prisma: PrismaService) {
  const [sectorCount, planetCount, wormholeCount, metaCount] = await Promise.all([
    prisma.sector.count(),
    prisma.planet.count(),
    prisma.wormhole.count(),
    prisma.galaxyMeta.count(),
  ]);
  return { sectorCount, planetCount, wormholeCount, metaCount };
}

// ─── G-DIV-1: Persisted seed wins over env seed on re-boot ───────────────────

describe('GalaxyService config divergence (G-DIV-1)', () => {
  // Standalone Prisma used only for cleanup — independent of any test module.
  let cleanupPrisma: PrismaService;

  beforeAll(async () => {
    cleanupPrisma = new PrismaService();
    await cleanupPrisma.$connect();
  });

  afterAll(async () => {
    await cleanGalaxy(cleanupPrisma);
    await cleanupPrisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanGalaxy(cleanupPrisma);
  });

  afterEach(async () => {
    delete process.env.GALAXY_SEED;
  });

  it(
    'G-DIV-1.1 — GalaxyMeta.seed retains the first-boot value when env seed diverges',
    async () => {
      // ── First boot: seed=42 → fresh DB ──
      process.env.GALAXY_SEED = '42';
      const app1: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app1.init();

      const prisma1 = app1.get(PrismaService);
      const metaAfterFirstBoot = await prisma1.galaxyMeta.findFirst();
      expect(metaAfterFirstBoot).not.toBeNull();
      expect(metaAfterFirstBoot!.seed).toBe(BigInt(42));

      await app1.close();

      // ── Second boot: seed=99 → same DB, GalaxyMeta already exists ──
      process.env.GALAXY_SEED = '99';
      const app2: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app2.init();

      const prisma2 = app2.get(PrismaService);
      const metaAfterSecondBoot = await prisma2.galaxyMeta.findFirst();
      expect(metaAfterSecondBoot).not.toBeNull();

      // Persisted value must win — seed must still be 42, not 99
      expect(metaAfterSecondBoot!.seed).toBe(BigInt(42));

      await app2.close();
    },
    30_000,
  );

  it(
    'G-DIV-1.2 — second boot with diverging seed writes zero new rows (all table counts unchanged)',
    async () => {
      // ── First boot: seed=42 ──
      process.env.GALAXY_SEED = '42';
      const app1: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app1.init();

      const prisma1 = app1.get(PrismaService);
      const countsAfterFirstBoot = await rowCounts(prisma1);
      expect(countsAfterFirstBoot.sectorCount).toBe(450);
      expect(countsAfterFirstBoot.metaCount).toBe(1);

      await app1.close();

      // ── Second boot: seed=99 ──
      process.env.GALAXY_SEED = '99';
      const app2: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app2.init();

      const prisma2 = app2.get(PrismaService);
      const countsAfterSecondBoot = await rowCounts(prisma2);

      // Every table count must be identical — no new writes
      expect(countsAfterSecondBoot).toEqual(countsAfterFirstBoot);

      await app2.close();
    },
    30_000,
  );

  it(
    'G-DIV-1.3 — second boot with diverging seed emits a WARN-level log mentioning "seed"',
    async () => {
      // ── First boot: seed=42 ──
      process.env.GALAXY_SEED = '42';
      const app1: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app1.init();
      await app1.close();

      // ── Second boot: seed=99 — spy BEFORE init() ──
      process.env.GALAXY_SEED = '99';
      const app2: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await app2.init();

      // At least one warn call must reference "seed"
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('seed'),
      );

      warnSpy.mockRestore();
      await app2.close();
    },
    30_000,
  );

  it(
    'G-DIV-1.4 — the WARN message names both the env value (99) and the persisted value (42)',
    async () => {
      // ── First boot: seed=42 ──
      process.env.GALAXY_SEED = '42';
      const app1: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await app1.init();
      await app1.close();

      // ── Second boot: seed=99 ──
      process.env.GALAXY_SEED = '99';
      const app2: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await app2.init();

      // The warning must mention both the env value and the persisted value
      const allWarnCalls: string[] = warnSpy.mock.calls
        .map((args) => (typeof args[0] === 'string' ? args[0] : ''))
        .filter(Boolean);

      const divergenceWarn = allWarnCalls.find(
        (msg) => msg.includes('seed') && msg.includes('42') && msg.includes('99'),
      );

      expect(divergenceWarn).toBeDefined();

      warnSpy.mockRestore();
      await app2.close();
    },
    30_000,
  );
});

// ─── G-DIV-2: Different seeds produce different planet coordinate sets ─────────

describe('GalaxyService seed diversity (G-DIV-2)', () => {
  let cleanupPrisma: PrismaService;

  beforeAll(async () => {
    cleanupPrisma = new PrismaService();
    await cleanupPrisma.$connect();
  });

  afterAll(async () => {
    await cleanGalaxy(cleanupPrisma);
    await cleanupPrisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanGalaxy(cleanupPrisma);
  });

  afterEach(async () => {
    delete process.env.GALAXY_SEED;
  });

  it(
    'G-DIV-2 — GALAXY_SEED=42 and GALAXY_SEED=999 produce different planet coordinate sets',
    async () => {
      // ── Boot A: seed=42 ──
      process.env.GALAXY_SEED = '42';
      const appA: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await appA.init();

      const prismaA = appA.get(PrismaService);
      const planetsA = await prismaA.planet.findMany({
        select: { xsect: true, ysect: true, plnum: true },
        orderBy: [{ xsect: 'asc' }, { ysect: 'asc' }, { plnum: 'asc' }],
      });
      const coordsA = planetsA.map((p) => `${p.xsect},${p.ysect},${p.plnum}`);

      await appA.close();

      // ── Clean DB between runs ──
      await cleanGalaxy(cleanupPrisma);

      // ── Boot B: seed=999 ──
      process.env.GALAXY_SEED = '999';
      const appB: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, GalaxyModule],
      }).compile();

      await appB.init();

      const prismaB = appB.get(PrismaService);
      const planetsB = await prismaB.planet.findMany({
        select: { xsect: true, ysect: true, plnum: true },
        orderBy: [{ xsect: 'asc' }, { ysect: 'asc' }, { plnum: 'asc' }],
      });
      const coordsB = planetsB.map((p) => `${p.xsect},${p.ysect},${p.plnum}`);

      await appB.close();

      // Both runs must have produced at least some planets
      expect(coordsA.length).toBeGreaterThan(0);
      expect(coordsB.length).toBeGreaterThan(0);

      // The coordinate sets must differ — identical layout would mean
      // the RNG is ignoring the seed value entirely.
      expect(coordsA).not.toEqual(coordsB);
    },
    30_000,
  );
});
