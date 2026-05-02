import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyModule } from '../../src/game/galaxy/galaxy.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// ─── tuple types ─────────────────────────────────────────────────────────────

interface PlanetTuple {
  xsect: number;
  ysect: number;
  plnum: number;
  name: string;
  type: number;
  enviorn: number;
  resource: number;
}

interface WormholeTuple {
  xsect: number;
  ysect: number;
  plnum: number;
  destXcoord: number;
  destYcoord: number;
  name: string;
  visible: number;
}

// ─── sort helpers ─────────────────────────────────────────────────────────────

function sortPlanets(tuples: PlanetTuple[]): PlanetTuple[] {
  return [...tuples].sort((a, b) => {
    if (a.xsect !== b.xsect) return a.xsect - b.xsect;
    if (a.ysect !== b.ysect) return a.ysect - b.ysect;
    return a.plnum - b.plnum;
  });
}

function sortWormholes(tuples: WormholeTuple[]): WormholeTuple[] {
  return [...tuples].sort((a, b) => {
    if (a.xsect !== b.xsect) return a.xsect - b.xsect;
    if (a.ysect !== b.ysect) return a.ysect - b.ysect;
    return a.plnum - b.plnum;
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function cleanGalaxy(prisma: PrismaService): Promise<void> {
  // Order matters: child tables first if FK constraints are in play.
  await prisma.planet.deleteMany();
  await prisma.wormhole.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.galaxyMeta.deleteMany();
}

// ─── boot helper ─────────────────────────────────────────────────────────────

/**
 * Boot a full NestJS test module, initialise it (which runs
 * GalaxyService.onModuleInit), collect planet/wormhole tuples, then close.
 *
 * @param seed - value written to process.env.GALAXY_SEED before compile
 */
async function bootAndCollect(seed: number): Promise<{
  planets: PlanetTuple[];
  wormholes: WormholeTuple[];
}> {
  process.env.GALAXY_SEED = String(seed);

  const module: TestingModule = await Test.createTestingModule({
    imports: [PrismaModule, GalaxyModule],
  }).compile();

  await module.init();

  const prisma = module.get(PrismaService);

  const rawPlanets = await prisma.planet.findMany({
    select: {
      xsect: true,
      ysect: true,
      plnum: true,
      name: true,
      type: true,
      enviorn: true,
      resource: true,
    },
  });

  const rawWormholes = await prisma.wormhole.findMany({
    select: {
      xsect: true,
      ysect: true,
      plnum: true,
      destXcoord: true,
      destYcoord: true,
      name: true,
      visible: true,
    },
  });

  await module.close();

  return { planets: rawPlanets, wormholes: rawWormholes };
}

// ─── tests ────────────────────────────────────────────────────────────────────

/**
 * G2: Same seed → identical planet tuple sets AND identical wormhole tuple sets.
 * G3: Different seeds → different planet coordinate sets.
 *
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md
 */
describe('galaxy determinism (G2, G3)', () => {
  const SEED_A = 99999;
  const SEED_B = 77777;

  // Prisma for inter-boot DB cleanup. We open a standalone connection
  // independent of any test module so cleanup is safe after module.close().
  let cleanupPrisma: PrismaService;

  beforeAll(async () => {
    cleanupPrisma = new PrismaService();
    await cleanupPrisma.$connect();
  });

  afterAll(async () => {
    // Leave the DB clean so other suites start from a known state.
    await cleanGalaxy(cleanupPrisma);
    await cleanupPrisma.$disconnect();
  });

  // Ensure a clean slate before each individual test — seeds may differ.
  beforeEach(async () => {
    await cleanGalaxy(cleanupPrisma);
  });

  it('G2: two boots with the same seed produce identical planet tuples', async () => {
    // ── First boot ──
    const first = await bootAndCollect(SEED_A);

    // Sanity: generation should have produced at least one planet.
    expect(first.planets.length).toBeGreaterThan(0);

    await cleanGalaxy(cleanupPrisma);

    // ── Second boot, same seed ──
    const second = await bootAndCollect(SEED_A);

    expect(sortPlanets(second.planets)).toEqual(sortPlanets(first.planets));
  }, 30_000);

  it('G2: two boots with the same seed produce identical wormhole tuples', async () => {
    // ── First boot ──
    const first = await bootAndCollect(SEED_A);

    expect(first.wormholes.length).toBeGreaterThan(0);

    await cleanGalaxy(cleanupPrisma);

    // ── Second boot, same seed ──
    const second = await bootAndCollect(SEED_A);

    expect(sortWormholes(second.wormholes)).toEqual(sortWormholes(first.wormholes));
  }, 30_000);

  it('G3: different seeds produce different planet coordinate sets', async () => {
    // ── Boot with seed A ──
    const runA = await bootAndCollect(SEED_A);
    const coordsA = sortPlanets(runA.planets).map(
      (p) => `${p.xsect},${p.ysect},${p.plnum}`,
    );

    await cleanGalaxy(cleanupPrisma);

    // ── Boot with seed B ──
    const runB = await bootAndCollect(SEED_B);
    const coordsB = sortPlanets(runB.planets).map(
      (p) => `${p.xsect},${p.ysect},${p.plnum}`,
    );

    // The coordinate arrays must differ somewhere — same layout for both
    // seeds would indicate the RNG is ignoring the seed entirely.
    expect(coordsA).not.toEqual(coordsB);
  }, 30_000);
});
