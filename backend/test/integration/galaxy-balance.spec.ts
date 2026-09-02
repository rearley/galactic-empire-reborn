import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyModule } from '../../src/game/galaxy/galaxy.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UNIVMAX } from '../../src/game/constants';

/**
 * G7, G8 — Galaxy balance + wormhole integrity integration tests.
 *
 * These tests are intentionally RED until T019 implements onModuleInit().
 * At that point, the counts and wormhole coords will be populated and
 * these assertions will go GREEN with no edits required here.
 *
 * G7: At default seed (12648430) and canon default tunables (plodds=3,
 *     wormodds=6, maxplanets=5 — MBMGEMSG.MSG), planet and wormhole counts fall within
 *     expected ranges.
 *
 * G8: Every wormhole's destination coords point to the centre of a valid
 *     sector grid cell that is distinct from the wormhole's source sector.
 *
 * @see specs/004-galaxy-generator/contracts/galaxy-service.md — G7, G8
 * @see GEMAIN.H — MAXX=30, MAXY=15 (the sca-lo viewport)
 * @see MBMGEMSG.MSG — PLODDS=3, WORMODDS=6, MAXPLSE=5
 * @see GEPLANET.C:455-650 xgetsector — wormhole placement logic
 */
describe('GalaxyService balance and wormhole integrity (G7, G8)', () => {
  let app: TestingModule;
  let prisma: PrismaService;

  beforeEach(async () => {
    // Pin the seed so generation is deterministic and assertions are stable.
    process.env.GALAXY_SEED = '12648430';
    // Ensure default tunables are in effect — clear any overrides.
    delete process.env.GALAXY_PLODDS;
    delete process.env.GALAXY_WORMODDS;
    delete process.env.GALAXY_MAXPLANETS;

    app = await Test.createTestingModule({
      imports: [GalaxyModule, PrismaModule],
    }).compile();

    prisma = app.get(PrismaService);

    // Clean slate — FK-safe order.
    await prisma.$transaction([
      prisma.wormhole.deleteMany(),
      prisma.planet.deleteMany(),
      prisma.sector.deleteMany(),
      prisma.galaxyMeta.deleteMany(),
    ]);

    // onModuleInit() runs here; GalaxyService generates and persists the galaxy.
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.GALAXY_SEED;
  });

  // ── G7: Balance — planet and wormhole counts ─────────────────────────────────

  /**
   * DENSITY DERIVED FROM THE TUNABLES, not a raw count and not a fixed band.
   *
   * UNIVMAX, PLODDS, WORMODDS and MAXPLSE are all sysop options
   * (GEMAIN.C:474 and MBMGEMSG.MSG), so any constant here silently encodes one
   * deployment's settings. These bounds were previously "the original [100,300]
   * and [10,40] per sector against the 441-sector galaxy they were calibrated
   * on" — which survived a UNIVMAX change but still hard-coded plodds=4 and
   * wormodds=10. Adopting canon's PLODDS=3 / WORMODDS=6 pushed wormhole density
   * to 0.111 against a 0.091 ceiling: the world was correct and the test was
   * measuring the previous configuration.
   *
   * The generator is a straightforward chain (GEPLANET.C:484-551):
   *   P(sector gets objects) = 1 / plodds
   *   E[slots | objects]     = mean of rng.intBelow(maxplanets), i.e. uniform
   *                            over 0..maxplanets-1, so (maxplanets - 1) / 2
   *   P(slot is a wormhole)  = 1 / wormodds, else it is a planet
   * so the expected per-sector densities follow directly, and the assertion
   * becomes "the generator behaves as its own configuration says it should" at
   * any world size and any tunable setting.
   */
  const TOLERANCE = 0.1; // +/-10%: sampling noise over tens of thousands of sectors is well inside this

  async function expectedDensities() {
    const meta = await prisma.galaxyMeta.findFirst();
    expect(meta).not.toBeNull();
    const { plodds, wormodds, maxplanets } = meta!;
    const objectsPerSector = (1 / plodds) * ((maxplanets - 1) / 2);
    return {
      planets: objectsPerSector * (1 - 1 / wormodds),
      wormholes: objectsPerSector * (1 / wormodds),
    };
  }

  it('G7.1 — planet DENSITY matches what the tunables predict', async () => {
    const count = await prisma.planet.count();
    const sectors = (2 * UNIVMAX + 1) ** 2;
    const density = count / sectors;
    const { planets: expected } = await expectedDensities();
    expect(density).toBeGreaterThanOrEqual(expected * (1 - TOLERANCE));
    expect(density).toBeLessThanOrEqual(expected * (1 + TOLERANCE));
  });

  it('G7.2 — wormhole DENSITY matches what the tunables predict', async () => {
    const count = await prisma.wormhole.count();
    const sectors = (2 * UNIVMAX + 1) ** 2;
    const density = count / sectors;
    const { wormholes: expected } = await expectedDensities();
    expect(density).toBeGreaterThanOrEqual(expected * (1 - TOLERANCE));
    expect(density).toBeLessThanOrEqual(expected * (1 + TOLERANCE));
  });

  // ── G8: Wormhole destination coordinate integrity ────────────────────────────

  it('G8.1 — every wormhole destXcoord has Math.floor(destXcoord) ∈ [-UNIVMAX, +UNIVMAX]', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { destXcoord: true },
    });

    // This assertion is vacuously true when count is 0 (stub), so the count
    // test above (G7.2) is the one that turns RED first.
    for (const wh of wormholes) {
      const destX = Math.floor(wh.destXcoord);
      expect(destX).toBeGreaterThanOrEqual(-UNIVMAX);
      expect(destX).toBeLessThanOrEqual(UNIVMAX);
    }
  });

  it('G8.2 — every wormhole destYcoord has Math.floor(destYcoord) ∈ [-UNIVMAX, +UNIVMAX]', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { destYcoord: true },
    });

    for (const wh of wormholes) {
      const destY = Math.floor(wh.destYcoord);
      expect(destY).toBeGreaterThanOrEqual(-UNIVMAX);
      expect(destY).toBeLessThanOrEqual(UNIVMAX);
    }
  });

  it('G8.3 — every wormhole destXcoord is a sector centre (fractional part == 0.5)', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { destXcoord: true },
    });

    // destXcoord = destX + 0.5 where destX is the integer sector column.
    for (const wh of wormholes) {
      const fractional = wh.destXcoord - Math.floor(wh.destXcoord);
      expect(fractional).toBeCloseTo(0.5, 9);
    }
  });

  it('G8.4 — every wormhole destYcoord is a sector centre (fractional part == 0.5)', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { destYcoord: true },
    });

    // destYcoord = destY + 0.5 where destY is the integer sector row.
    for (const wh of wormholes) {
      const fractional = wh.destYcoord - Math.floor(wh.destYcoord);
      expect(fractional).toBeCloseTo(0.5, 9);
    }
  });

  it('G8.5 — no wormhole destinations point back to its own source sector', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { xsect: true, ysect: true, destXcoord: true, destYcoord: true },
    });

    for (const wh of wormholes) {
      const destX = Math.floor(wh.destXcoord);
      const destY = Math.floor(wh.destYcoord);
      // Destination sector must differ from source sector on at least one axis.
      const isSelfLoop = destX === wh.xsect && destY === wh.ysect;
      expect(isSelfLoop).toBe(false);
    }
  });

  // ── G8: Combined — all constraints together in one pass ──────────────────────

  it('G8.6 — every wormhole satisfies all destination coordinate constraints together', async () => {
    const wormholes = await prisma.wormhole.findMany({
      select: { xsect: true, ysect: true, destXcoord: true, destYcoord: true },
    });

    // There must be at least one wormhole for this test to be meaningful;
    // absence of rows would be caught by G7.2, but we assert it here too
    // so a full run of this file surfaces the failure in context.
    expect(wormholes.length).toBeGreaterThan(0);

    for (const wh of wormholes) {
      const destX = Math.floor(wh.destXcoord);
      const destY = Math.floor(wh.destYcoord);
      const fracX = wh.destXcoord - destX;
      const fracY = wh.destYcoord - destY;

      // Valid grid column.
      expect(destX).toBeGreaterThanOrEqual(-UNIVMAX);
      expect(destX).toBeLessThanOrEqual(UNIVMAX);

      // Valid grid row.
      expect(destY).toBeGreaterThanOrEqual(-UNIVMAX);
      expect(destY).toBeLessThanOrEqual(UNIVMAX);

      // Coords are sector centres, not arbitrary floats.
      expect(fracX).toBeCloseTo(0.5, 9);
      expect(fracY).toBeCloseTo(0.5, 9);

      // Not a self-loop.
      expect(destX === wh.xsect && destY === wh.ysect).toBe(false);
    }
  });
});
