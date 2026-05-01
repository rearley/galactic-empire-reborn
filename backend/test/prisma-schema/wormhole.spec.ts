/**
 * Wormhole entity (GALWORM) — FR-017
 * @see reference/ge-source/GEMAIN.H:467
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildWormholeSentinel } from "./helpers/sentinel-builders";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Wormhole entity", () => {
  it("round-trips all GALWORM fields including destination coord", async () => {
    const s = buildWormholeSentinel(10, 5, 1);
    await prisma.wormhole.create({ data: s });
    const found = await prisma.wormhole.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 10, ysect: 5, plnum: 1 } },
    });

    expect(found.type).toBe(s.type);
    expect(found.xcoord).toBeCloseTo(s.xcoord);
    expect(found.ycoord).toBeCloseTo(s.ycoord);
    expect(found.visible).toBe(s.visible);
    expect(found.destXcoord).toBeCloseTo(s.destXcoord);
    expect(found.destYcoord).toBeCloseTo(s.destYcoord);
    expect(found.name).toBe(s.name);
  });

  it("allows a destination outside the 30×15 grid (edge case from spec)", async () => {
    const s = {
      ...buildWormholeSentinel(1, 1, 1),
      destXcoord: 99.9,
      destYcoord: 99.9,
    };
    await prisma.wormhole.create({ data: s });
    const found = await prisma.wormhole.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 1, ysect: 1, plnum: 1 } },
    });
    expect(found.destXcoord).toBeCloseTo(99.9);
    expect(found.destYcoord).toBeCloseTo(99.9);
  });

  it("allows a ship at exactly (0, 0) — neutral zone origin (edge case)", async () => {
    const s = {
      ...buildWormholeSentinel(0, 0, 1),
      xcoord: 0.0,
      ycoord: 0.0,
    };
    await prisma.wormhole.create({ data: s });
    const found = await prisma.wormhole.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 0, ysect: 0, plnum: 1 } },
    });
    expect(found.xcoord).toBe(0.0);
    expect(found.ycoord).toBe(0.0);
  });

  it("rejects duplicate (xsect, ysect, plnum) PK", async () => {
    await prisma.wormhole.create({ data: buildWormholeSentinel(2, 3, 1) });
    await expect(
      prisma.wormhole.create({ data: buildWormholeSentinel(2, 3, 1) })
    ).rejects.toThrow();
  });
});
