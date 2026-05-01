/**
 * Ship entity (WARSHP) — FR-004..FR-010, FR-033..FR-035
 * @see reference/ge-source/GEMAIN.H:316
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildShipSentinel, buildUserSentinel } from "./helpers/sentinel-builders";
import { MAXTORPS, MAXMISSL, MAXDECOY, NUMITEMS } from "./helpers/constants";

const USER_ID = "shipspecuser12345678901234567";

beforeEach(async () => {
  await truncateAll();
  await prisma.user.create({ data: buildUserSentinel(USER_ID) });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ship entity", () => {
  it("round-trips all WARSHP fields with non-default sentinel values", async () => {
    const s = buildShipSentinel(USER_ID, 1);
    await prisma.ship.create({ data: s });
    const found = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: USER_ID, shipno: 1 } },
    });

    // Scalar fields
    expect(found.shipname).toBe(s.shipname);
    expect(found.shpclass).toBe(s.shpclass);
    expect(found.heading).toBeCloseTo(s.heading);
    expect(found.head2b).toBeCloseTo(s.head2b);
    expect(found.speed).toBeCloseTo(s.speed);
    expect(found.speed2b).toBeCloseTo(s.speed2b);
    expect(found.xcoord).toBeCloseTo(s.xcoord);
    expect(found.ycoord).toBeCloseTo(s.ycoord);
    expect(found.damage).toBeCloseTo(s.damage);
    expect(found.energy).toBeCloseTo(s.energy);
    expect(found.phasr).toBeCloseTo(s.phasr);
    expect(found.phasrtype).toBe(s.phasrtype);
    expect(found.kills).toBe(s.kills);
    expect(found.lastfired).toBe(s.lastfired);
    expect(found.shieldtype).toBe(s.shieldtype);
    expect(found.shieldstat).toBe(s.shieldstat);
    expect(found.shield).toBe(s.shield);
    expect(found.cloak).toBe(s.cloak);
    expect(found.degrees).toBe(s.degrees);
    expect(found.percent).toBe(s.percent);
    expect(found.tactical).toBe(s.tactical);
    expect(found.helm).toBe(s.helm);
    expect(found.train).toBe(s.train);
    expect(found.where).toBe(s.where);
    expect(found.jammer).toBe(s.jammer);
    expect(found.titem).toBe(s.titem);
    expect(found.hostile).toBe(s.hostile);
    expect(found.cantexit).toBe(s.cantexit);
    expect(found.repair).toBe(s.repair);
    expect(found.hypha).toBe(s.hypha);
    expect(found.firecntl).toBe(s.firecntl);
    expect(found.destruct).toBe(s.destruct);
    expect(found.status).toBe(s.status);
    expect(found.cybmine).toBe(s.cybmine);
    expect(found.cybskill).toBe(s.cybskill);
    expect(found.cybupdate).toBe(s.cybupdate);
    expect(found.tick).toBe(s.tick);
    expect(found.emulate).toBe(s.emulate);
    expect(found.minesnear).toBe(s.minesnear);
    expect(found.lock).toBe(s.lock);
    expect(found.holdcourse).toBe(s.holdcourse);
    expect(found.topspeed).toBe(s.topspeed);
    expect(found.warncntr).toBe(s.warncntr);
  });

  it("round-trips all parallel array columns at correct GEMAIN.H lengths (FR-034, FR-035)", async () => {
    const s = buildShipSentinel(USER_ID, 2);
    await prisma.ship.create({ data: s });
    const found = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: USER_ID, shipno: 2 } },
    });

    expect(found.ltorpsChannel).toHaveLength(MAXTORPS);
    expect(found.ltorpsDistance).toHaveLength(MAXTORPS);
    expect(found.lmisslChannel).toHaveLength(MAXMISSL);
    expect(found.lmisslDistance).toHaveLength(MAXMISSL);
    expect(found.lmisslEnergy).toHaveLength(MAXMISSL);
    expect(found.decout).toHaveLength(MAXDECOY);
    expect(found.freq).toHaveLength(3);
    expect(found.items).toHaveLength(NUMITEMS);

    expect(found.ltorpsChannel).toEqual(s.ltorpsChannel);
    expect(found.ltorpsDistance).toEqual(s.ltorpsDistance);
    expect(found.lmisslChannel).toEqual(s.lmisslChannel);
    expect(found.lmisslDistance).toEqual(s.lmisslDistance);
    expect(found.lmisslEnergy).toEqual(s.lmisslEnergy);
    expect(found.decout).toEqual(s.decout);
    expect(found.freq).toEqual(s.freq);
    expect(found.items).toEqual(s.items);
  });

  it("rejects duplicate (userid, shipno) composite PK (FR-009)", async () => {
    const s = buildShipSentinel(USER_ID, 5);
    await prisma.ship.create({ data: s });
    await expect(prisma.ship.create({ data: s })).rejects.toThrow();
  });

  it("rejects a Ship with a non-existent userid FK (R-3)", async () => {
    const s = buildShipSentinel("nonexistent_user_id_xxxxxxxxxx", 1);
    await expect(prisma.ship.create({ data: s })).rejects.toThrow();
  });

  it("items[] BigInt values > 2^31 round-trip (FR-034, FR-037)", async () => {
    const bigCargo = Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 1) * 9_999_999_999n);
    const s = { ...buildShipSentinel(USER_ID, 3), items: bigCargo };
    await prisma.ship.create({ data: s });
    const found = await prisma.ship.findUniqueOrThrow({
      where: { userid_shipno: { userid: USER_ID, shipno: 3 } },
    });
    expect(found.items).toEqual(bigCargo);
  });
});
