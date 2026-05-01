/**
 * Sector entity (GALSECT) — FR-011..FR-013, SC-005
 * @see reference/ge-source/GEMAIN.H:424
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildSectorSentinel } from "./helpers/sentinel-builders";
import { MAXX, MAXY } from "./helpers/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Sector entity", () => {
  it("round-trips all GALSECT fields", async () => {
    const s = buildSectorSentinel(5, 7);
    await prisma.sector.create({ data: s });
    const found = await prisma.sector.findUniqueOrThrow({
      where: { xsect_ysect: { xsect: 5, ysect: 7 } },
    });
    expect(found.xsect).toBe(5);
    expect(found.ysect).toBe(7);
    expect(found.plnum).toBe(s.plnum);
    expect(found.type).toBe(s.type);
    expect(found.numplan).toBe(s.numplan);
  });

  it(`inserts exactly MAXX * MAXY = ${MAXX * MAXY} sectors (FR-011, SC-005)`, async () => {
    const rows = [];
    for (let x = 0; x < MAXX; x++) {
      for (let y = 0; y < MAXY; y++) {
        rows.push({ xsect: x, ysect: y, plnum: 0, type: 1, numplan: 0 });
      }
    }
    await prisma.sector.createMany({ data: rows });
    const count = await prisma.sector.count();
    expect(count).toBe(MAXX * MAXY);
  });

  it("rejects duplicate (xsect, ysect) composite PK (FR-012, SC-005)", async () => {
    await prisma.sector.create({ data: { xsect: 1, ysect: 2, plnum: 0, type: 0, numplan: 0 } });
    await expect(
      prisma.sector.create({ data: { xsect: 1, ysect: 2, plnum: 0, type: 1, numplan: 1 } })
    ).rejects.toThrow();
  });
});
