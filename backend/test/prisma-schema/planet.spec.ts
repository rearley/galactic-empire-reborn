/**
 * Planet entity (GALPLNT + ITEM) — FR-014..FR-016
 * @see reference/ge-source/GEMAIN.H:438
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildPlanetSentinel } from "./helpers/sentinel-builders";
import { NUMITEMS, BEACONMSGSZ } from "./helpers/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Planet entity", () => {
  it("round-trips all GALPLNT fields with non-default sentinel values", async () => {
    const s = buildPlanetSentinel(3, 4, 1);
    await prisma.planet.create({ data: s });
    const found = await prisma.planet.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 3, ysect: 4, plnum: 1 } },
    });

    expect(found.type).toBe(s.type);
    expect(found.xcoord).toBeCloseTo(s.xcoord);
    expect(found.ycoord).toBeCloseTo(s.ycoord);
    expect(found.userid).toBe(s.userid);
    expect(found.name).toBe(s.name);
    expect(found.enviorn).toBe(s.enviorn);
    expect(found.resource).toBe(s.resource);
    expect(found.cash).toBe(s.cash);
    expect(found.debt).toBe(s.debt);
    expect(found.tax).toBe(s.tax);
    expect(found.taxrate).toBe(s.taxrate);
    expect(found.warnings).toBe(s.warnings);
    expect(found.password).toBe(s.password);
    expect(found.lastattack).toBe(s.lastattack);
    expect(found.beacon).toBe(s.beacon);
    expect(found.spyowner).toBe(s.spyowner);
    expect(found.technology).toBe(s.technology);
    expect(found.teamcode).toBe(s.teamcode);
  });

  it("beacon accepts and round-trips BEACONMSGSZ=75 characters (FR-014)", async () => {
    expect(BEACONMSGSZ).toBe(75);
    const beacon = "B".repeat(BEACONMSGSZ);
    const s = { ...buildPlanetSentinel(1, 1, 1), beacon };
    await prisma.planet.create({ data: s });
    const found = await prisma.planet.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 1, ysect: 1, plnum: 1 } },
    });
    expect(found.beacon).toHaveLength(BEACONMSGSZ);
    expect(found.beacon).toBe(beacon);
  });

  it("round-trips all 6 ITEM parallel arrays at NUMITEMS=14 length (FR-016)", async () => {
    const s = buildPlanetSentinel(2, 2, 1);
    await prisma.planet.create({ data: s });
    const found = await prisma.planet.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 2, ysect: 2, plnum: 1 } },
    });

    expect(found.itemsQty).toHaveLength(NUMITEMS);
    expect(found.itemsRate).toHaveLength(NUMITEMS);
    expect(found.itemsSell).toHaveLength(NUMITEMS);
    expect(found.itemsReserve).toHaveLength(NUMITEMS);
    expect(found.itemsMarkup2a).toHaveLength(NUMITEMS);
    expect(found.itemsSold2a).toHaveLength(NUMITEMS);

    expect(found.itemsQty).toEqual(s.itemsQty);
    expect(found.itemsRate).toEqual(s.itemsRate);
    expect(found.itemsSell).toEqual(s.itemsSell);
    expect(found.itemsReserve).toEqual(s.itemsReserve);
    expect(found.itemsMarkup2a).toEqual(s.itemsMarkup2a);
    expect(found.itemsSold2a).toEqual(s.itemsSold2a);
  });

  it("composite PK (xsect, ysect, plnum) rejects duplicates (FR-015)", async () => {
    await prisma.planet.create({ data: buildPlanetSentinel(5, 5, 1) });
    await expect(
      prisma.planet.create({ data: buildPlanetSentinel(5, 5, 1) })
    ).rejects.toThrow();
  });

  it("two planets with the same sector but different plnum coexist (edge case)", async () => {
    await prisma.planet.create({ data: buildPlanetSentinel(6, 6, 1) });
    await prisma.planet.create({ data: buildPlanetSentinel(6, 6, 2) });
    const count = await prisma.planet.count({
      where: { xsect: 6, ysect: 6 },
    });
    expect(count).toBe(2);
  });
});
