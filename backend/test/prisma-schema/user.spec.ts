/**
 * User entity (WARUSR) — FR-001..FR-003, FR-034, FR-036
 * @see reference/ge-source/GEMAIN.H:292
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildUserSentinel } from "./helpers/sentinel-builders";
import { UIDSIZ } from "./helpers/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("User entity", () => {
  it("round-trips all fields with non-default sentinel values", async () => {
    const sentinel = buildUserSentinel("testuser123456789012345678901");
    await prisma.user.create({ data: sentinel });

    const found = await prisma.user.findUniqueOrThrow({
      where: { userid: sentinel.userid },
    });

    expect(found.userid).toBe(sentinel.userid);
    expect(found.score).toBe(sentinel.score);
    expect(found.noships).toBe(sentinel.noships);
    expect(found.topshipno).toBe(sentinel.topshipno);
    expect(found.kills).toBe(sentinel.kills);
    expect(found.rospos).toBe(sentinel.rospos);
    expect(found.planets).toBe(sentinel.planets);
    expect(found.cash).toBe(sentinel.cash);
    expect(found.debt).toBe(sentinel.debt);
    expect(found.plscore).toBe(sentinel.plscore);
    expect(found.klscore).toBe(sentinel.klscore);
    expect(found.population).toBe(sentinel.population);
    expect(found.options).toEqual(sentinel.options);
    expect(found.teamcode).toBe(sentinel.teamcode);
  });

  it("rejects duplicate userid (FR-002)", async () => {
    const s = buildUserSentinel("dupeuser12345678901234567890");
    await prisma.user.create({ data: s });
    await expect(prisma.user.create({ data: s })).rejects.toThrow();
  });

  it("BigInt columns accept values > 2^31 − 1 (FR-036)", async () => {
    const bigValue = BigInt("9_999_999_999".replace(/_/g, ""));
    const s = buildUserSentinel("bigintuser12345678901234567");
    const data = { ...s, score: bigValue, cash: bigValue, debt: bigValue };
    await prisma.user.create({ data });
    const found = await prisma.user.findUniqueOrThrow({ where: { userid: data.userid } });
    expect(found.score).toBe(bigValue);
    expect(found.cash).toBe(bigValue);
    expect(found.debt).toBe(bigValue);
  });

  it("options[] round-trips at exactly UIDSIZ length (FR-034)", async () => {
    const s = buildUserSentinel("optionsuser123456789012345678");
    await prisma.user.create({ data: s });
    const found = await prisma.user.findUniqueOrThrow({ where: { userid: s.userid } });
    expect(found.options).toHaveLength(30); // UIDSIZ = 30
    expect(UIDSIZ).toBe(30); // balance-regression anchor
    expect(found.options).toEqual(s.options);
  });

  it("teamcode is nullable and accepts null (FR-001)", async () => {
    const s = buildUserSentinel("nullteamuser12345678901234567");
    const data = { ...s, teamcode: null };
    await prisma.user.create({ data });
    const found = await prisma.user.findUniqueOrThrow({ where: { userid: data.userid } });
    expect(found.teamcode).toBeNull();
  });
});
