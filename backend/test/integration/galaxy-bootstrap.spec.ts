import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyModule } from '../../src/game/galaxy/galaxy.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UNIVMAX } from '../../src/game/constants';

/**
 * G1 — Galaxy bootstrap integration tests.
 *
 * Verifies that GalaxyService.onModuleInit() generates and persists
 * a complete universe square (UNIVERSE_SECTORS Sector rows + 1 GalaxyMeta row) on first boot.
 *
 * These tests are intentionally RED until T019 implements onModuleInit().
 *
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md — G1
 * @see GEPLANET.C:455-650 xgetsector — procedural sector generation
 * The universe runs -UNIVMAX..+UNIVMAX on both axes with the neutral zone at
 * its CENTRE, as in C (GEMAIN.H:70 NEUTRAL_X=0, GEMAIN.C:2204 coordinates
 * seeded as rndm(univmax*2)-univmax). It used to be a 0-based 30x15 grid, which
 * put the hub in a corner. MAXX/MAXY remain the ASCII SCAN grid, not the galaxy.
 *
 * @see GEMAIN.C:474 univmax = numopt(UNIVMAX,10,32767)
 */
const UNIVERSE_SECTORS = (UNIVMAX * 2 + 1) ** 2;

describe('GalaxyService bootstrap (G1)', () => {
  let app: TestingModule;
  let prisma: PrismaService;

  beforeEach(async () => {
    // Pin the seed so generation is deterministic and assertions are stable.
    process.env.GALAXY_SEED = '12648430';

    app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    prisma = app.get(PrismaService);

    // Clean slate — order is FK-safe (no cross-table FK between these models).
    await prisma.$transaction([
      prisma.wormhole.deleteMany(),
      prisma.planet.deleteMany(),
      prisma.sector.deleteMany(),
      prisma.galaxyMeta.deleteMany(),
    ]);

    // onModuleInit() runs here; GalaxyService must generate and persist the galaxy.
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.GALAXY_SEED;
  });

  // ── Row-count assertions ─────────────────────────────────────────────────────

  it('G1.1 — Sector table contains exactly one row per universe sector', async () => {
    const count = await prisma.sector.count();
    expect(count).toBe(UNIVERSE_SECTORS); // (2*UNIVMAX+1)^2
  });

  it('G1.2 — GalaxyMeta table contains exactly 1 row after init', async () => {
    const count = await prisma.galaxyMeta.count();
    expect(count).toBe(1);
  });

  // ── GalaxyMeta content assertions ────────────────────────────────────────────

  it('G1.3 — GalaxyMeta row records the seed used during generation', async () => {
    const meta = await prisma.galaxyMeta.findFirst();
    expect(meta).not.toBeNull();
    expect(meta!.seed).toBe(BigInt(12648430));
  });

  it('G1.4 — GalaxyMeta row records default plodds=4', async () => {
    const meta = await prisma.galaxyMeta.findFirst();
    expect(meta).not.toBeNull();
    expect(meta!.plodds).toBe(4);
  });

  it('G1.5 — GalaxyMeta row records default wormodds=10', async () => {
    const meta = await prisma.galaxyMeta.findFirst();
    expect(meta).not.toBeNull();
    expect(meta!.wormodds).toBe(10);
  });

  it('G1.6 — GalaxyMeta row records default maxplanets=5', async () => {
    const meta = await prisma.galaxyMeta.findFirst();
    expect(meta).not.toBeNull();
    expect(meta!.maxplanets).toBe(5);
  });

  // ── Sector coordinate coverage assertions ────────────────────────────────────

  it('G1.7 — every (x,y) in -UNIVMAX..+UNIVMAX exists exactly once', async () => {
    const sectors = await prisma.sector.findMany({
      select: { xsect: true, ysect: true },
    });

    expect(sectors).toHaveLength(UNIVERSE_SECTORS);

    // Build a set of "x,y" keys from the DB.
    const keys = new Set(sectors.map((s) => `${s.xsect},${s.ysect}`));

    // Exactly the full universe square — no gaps, no duplicates.
    expect(keys.size).toBe(UNIVERSE_SECTORS); // no duplicates

    for (let x = -UNIVMAX; x <= UNIVMAX; x++) {
      for (let y = -UNIVMAX; y <= UNIVMAX; y++) {
        expect(keys.has(`${x},${y}`)).toBe(true); // no gaps
      }
    }
  });

  it('G1.8 — no sector lies outside the universe square', async () => {
    const outOfBounds = await prisma.sector.findMany({
      where: {
        OR: [
          { xsect: { lt: -UNIVMAX } },
          { xsect: { gt: UNIVMAX } },
          { ysect: { lt: -UNIVMAX } },
          { ysect: { gt: UNIVMAX } },
        ],
      },
    });

    expect(outOfBounds).toHaveLength(0);
  });

  // ── Idempotency assertion ────────────────────────────────────────────────────

  it('G1.9 — re-initialising with an existing galaxy does not create duplicate rows', async () => {
    // Simulate a second boot (onModuleInit must detect the existing galaxy and skip generation).
    const app2 = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    // Re-use the same PrismaService so both apps hit the same DB.
    const prisma2 = app2.get(PrismaService);

    await app2.init();

    const sectorCount = await prisma2.sector.count();
    const metaCount = await prisma2.galaxyMeta.count();

    await app2.close();

    expect(sectorCount).toBe(UNIVERSE_SECTORS);
    expect(metaCount).toBe(1);
  });
});
