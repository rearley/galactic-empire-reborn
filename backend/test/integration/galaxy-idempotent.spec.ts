import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyModule } from '../../src/game/galaxy/galaxy.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * G4 + G5 — Galaxy idempotency and rollback integration tests.
 *
 * G4: A second boot against a populated DB performs zero writes.
 * G5: Crashing the generation transaction (simulated via a spy on
 *     prisma.galaxyMeta.create) leaves all tables empty (rollback).
 *
 * These tests are intentionally RED until T019 implements onModuleInit().
 *
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md — G4, G5
 * @see GEPLANET.C:455-650 xgetsector — procedural sector generation
 * @see GEMAIN.H — MAXX=30, MAXY=15
 */

/** Helper: clean all galaxy tables in FK-safe order. */
async function cleanGalaxyTables(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.wormhole.deleteMany(),
    prisma.planet.deleteMany(),
    prisma.sector.deleteMany(),
    prisma.galaxyMeta.deleteMany(),
  ]);
}

/** Helper: snapshot row counts for all galaxy tables. */
async function rowCounts(prisma: PrismaService) {
  const [sectorCount, planetCount, wormholeCount, metaCount] =
    await Promise.all([
      prisma.sector.count(),
      prisma.planet.count(),
      prisma.wormhole.count(),
      prisma.galaxyMeta.count(),
    ]);
  return { sectorCount, planetCount, wormholeCount, metaCount };
}

// ── G4: Second boot performs zero writes ──────────────────────────────────────

describe('GalaxyService idempotency (G4)', () => {
  let app1: TestingModule;
  let prisma: PrismaService;

  beforeEach(async () => {
    process.env.GALAXY_SEED = '12648430';

    // First boot — populate the galaxy from scratch.
    app1 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    prisma = app1.get(PrismaService);
    await cleanGalaxyTables(prisma);
    await app1.init();
  });

  afterEach(async () => {
    await app1.close();
    delete process.env.GALAXY_SEED;
  });

  it('G4.1 — second boot with the same seed does not insert additional Sector rows', async () => {
    const beforeCounts = await rowCounts(prisma);
    expect(beforeCounts.sectorCount).toBe(450); // first boot must have populated

    // Second boot — fresh TestingModule, same env seed, DB already populated.
    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    try {
      await app2.init();
      const afterCounts = await rowCounts(app2.get(PrismaService));
      expect(afterCounts.sectorCount).toBe(beforeCounts.sectorCount);
    } finally {
      await app2.close();
    }
  });

  it('G4.2 — second boot with the same seed does not insert additional Planet rows', async () => {
    const beforeCounts = await rowCounts(prisma);

    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    try {
      await app2.init();
      const afterCounts = await rowCounts(app2.get(PrismaService));
      expect(afterCounts.planetCount).toBe(beforeCounts.planetCount);
    } finally {
      await app2.close();
    }
  });

  it('G4.3 — second boot with the same seed does not insert additional Wormhole rows', async () => {
    const beforeCounts = await rowCounts(prisma);

    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    try {
      await app2.init();
      const afterCounts = await rowCounts(app2.get(PrismaService));
      expect(afterCounts.wormholeCount).toBe(beforeCounts.wormholeCount);
    } finally {
      await app2.close();
    }
  });

  it('G4.4 — second boot with the same seed does not insert additional GalaxyMeta rows', async () => {
    const beforeCounts = await rowCounts(prisma);
    expect(beforeCounts.metaCount).toBe(1); // first boot must have created exactly 1

    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    try {
      await app2.init();
      const afterCounts = await rowCounts(app2.get(PrismaService));
      expect(afterCounts.metaCount).toBe(1);
    } finally {
      await app2.close();
    }
  });

  it('G4.5 — row counts after second boot exactly match row counts after first boot', async () => {
    const firstBootCounts = await rowCounts(prisma);

    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    try {
      await app2.init();
      const secondBootCounts = await rowCounts(app2.get(PrismaService));
      expect(secondBootCounts).toEqual(firstBootCounts);
    } finally {
      await app2.close();
    }
  });
});

// ── G5: Mid-transaction crash → all tables remain empty (rollback) ────────────

/**
 * Wrap localPrisma.$transaction so the callback receives a patched tx client
 * where `tx.galaxyMeta.create` always throws.
 *
 * Prisma interactive transactions create a new scoped client (`tx`), so
 * spying on `localPrisma.galaxyMeta.create` does NOT intercept the tx-scoped
 * call. Intercepting at the `$transaction` level and patching the tx object
 * is the correct approach.
 */
function patchTransactionToFailOnMetaInsert(localPrisma: PrismaService): void {
  const realTxFn = localPrisma.$transaction.bind(localPrisma);
  jest.spyOn(localPrisma, '$transaction').mockImplementation((fn: any, opts?: any) => {
    if (typeof fn !== 'function') {
      // Batch transaction — leave untouched (used in test cleanup)
      return realTxFn(fn, opts);
    }
    // Callback-style interactive transaction — wrap with failing tx
    return realTxFn(async (tx: any) => {
      // Patch galaxyMeta.create on the real transaction client
      tx.galaxyMeta.create = async () => {
        throw new Error('simulated crash: galaxyMeta.create');
      };
      return fn(tx);
    }, opts);
  });
}

describe('GalaxyService rollback (G5)', () => {
  beforeEach(async () => {
    process.env.GALAXY_SEED = '12648430';
    const setup = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();
    const p = setup.get(PrismaService);
    await cleanGalaxyTables(p);
    await setup.close();
  });

  afterEach(async () => {
    const setup = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();
    const p = setup.get(PrismaService);
    await cleanGalaxyTables(p);
    await setup.close();
    delete process.env.GALAXY_SEED;
  });

  it('G5.1 — when galaxyMeta.create throws, init() rejects', async () => {
    const app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();
    const localPrisma = app.get(PrismaService);
    patchTransactionToFailOnMetaInsert(localPrisma);

    await expect(app.init()).rejects.toThrow('simulated crash: galaxyMeta.create');

    await app.close().catch(() => {});
  });

  it('G5.2 — when galaxyMeta.create throws, Sector table remains empty (transaction rolled back)', async () => {
    const app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();
    const localPrisma = app.get(PrismaService);
    patchTransactionToFailOnMetaInsert(localPrisma);

    await app.init().catch(() => {});
    const counts = await rowCounts(localPrisma);
    await app.close().catch(() => {});

    expect(counts.sectorCount).toBe(0);
  });

  it('G5.3 — when galaxyMeta.create throws, Planet table remains empty (transaction rolled back)', async () => {
    const app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();
    const localPrisma = app.get(PrismaService);
    patchTransactionToFailOnMetaInsert(localPrisma);

    await app.init().catch(() => {});
    const counts = await rowCounts(localPrisma);
    await app.close().catch(() => {});

    expect(counts.planetCount).toBe(0);
  });

  it('G5.4 — when galaxyMeta.create throws, Wormhole table remains empty (transaction rolled back)', async () => {
    const app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();
    const localPrisma = app.get(PrismaService);
    patchTransactionToFailOnMetaInsert(localPrisma);

    await app.init().catch(() => {});
    const counts = await rowCounts(localPrisma);
    await app.close().catch(() => {});

    expect(counts.wormholeCount).toBe(0);
  });

  it('G5.5 — when galaxyMeta.create throws, GalaxyMeta table remains empty (transaction rolled back)', async () => {
    const app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();
    const localPrisma = app.get(PrismaService);
    patchTransactionToFailOnMetaInsert(localPrisma);

    await app.init().catch(() => {});
    const counts = await rowCounts(localPrisma);
    await app.close().catch(() => {});

    expect(counts.metaCount).toBe(0);
  });
});
