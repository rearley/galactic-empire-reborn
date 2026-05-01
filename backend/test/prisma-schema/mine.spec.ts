/**
 * Mine entity (MINE + modernization fields) — FR-028..FR-030
 * @see reference/ge-source/GEMAIN.H:267
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildMineSentinel } from "./helpers/sentinel-builders";

const DEPLOYER = "minedeployer12345678901234567";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Mine entity", () => {
  it("round-trips all MINE fields plus modernization fields (FR-028..FR-030)", async () => {
    const s = buildMineSentinel(DEPLOYER);
    const created = await prisma.mine.create({ data: s });

    const found = await prisma.mine.findUniqueOrThrow({ where: { id: created.id } });
    expect(found.channel).toBe(s.channel);
    expect(found.timer).toBe(s.timer);
    expect(found.xcoord).toBeCloseTo(s.xcoord);
    expect(found.ycoord).toBeCloseTo(s.ycoord);
    expect(found.deployedBy).toBe(DEPLOYER);
    expect(found.deployedAt).toEqual(s.deployedAt);
  });

  it("id is auto-assigned by the database", async () => {
    const m1 = await prisma.mine.create({ data: buildMineSentinel(DEPLOYER) });
    const m2 = await prisma.mine.create({ data: buildMineSentinel(DEPLOYER) });
    expect(m1.id).not.toBe(m2.id);
    expect(typeof m1.id).toBe("number");
  });

  it("two mines at the same coordinates coexist (multiple mines stacked)", async () => {
    await prisma.mine.create({ data: { ...buildMineSentinel(DEPLOYER), xcoord: 5.0, ycoord: 5.0 } });
    await prisma.mine.create({ data: { ...buildMineSentinel(DEPLOYER), xcoord: 5.0, ycoord: 5.0 } });
    const count = await prisma.mine.count({ where: { xcoord: 5.0, ycoord: 5.0 } });
    expect(count).toBe(2);
  });

  it("deployedBy has no FK — allows a string for a deleted user (FR-030)", async () => {
    const s = buildMineSentinel("deleted_user_xxxxxxxxxxxxxxxxx");
    const created = await prisma.mine.create({ data: s });
    expect(created.deployedBy).toBe("deleted_user_xxxxxxxxxxxxxxxxx");
  });
});
