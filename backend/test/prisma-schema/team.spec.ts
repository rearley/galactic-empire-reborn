/**
 * Team entity (TEAM) — FR-018..FR-019, SC-005
 * @see reference/ge-source/GEMAIN.H:645
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildTeamSentinel } from "./helpers/sentinel-builders";
import { MAXTEAMS } from "./helpers/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Team entity", () => {
  it("round-trips all TEAM fields with non-default sentinel values", async () => {
    const s = buildTeamSentinel(42n);
    await prisma.team.create({ data: s });
    const found = await prisma.team.findUniqueOrThrow({ where: { teamcode: 42n } });

    expect(found.teamcode).toBe(42n);
    expect(found.teamname).toBe(s.teamname);
    expect(found.teamcount).toBe(s.teamcount);
    expect(found.teamscore).toBe(s.teamscore);
    expect(found.password).toBe(s.password);
    expect(found.secret).toBe(s.secret);
    expect(found.flag).toBe(s.flag);
  });

  it(`inserts MAXTEAMS=${MAXTEAMS} teams without error (FR-019, SC-005)`, async () => {
    const rows = Array.from({ length: MAXTEAMS }, (_, i) => ({
      teamcode: BigInt(i + 1),
      teamname: `Team ${i + 1}`.padEnd(31, " ").slice(0, 31),
      teamcount: 1,
      teamscore: 0n,
      password: "pass".padEnd(11, " ").slice(0, 11),
      secret: "secr".padEnd(11, " ").slice(0, 11),
      flag: 0,
    }));
    await prisma.team.createMany({ data: rows });
    const count = await prisma.team.count();
    expect(count).toBe(MAXTEAMS);
  });

  it("rejects duplicate teamcode (FR-018, SC-005)", async () => {
    await prisma.team.create({ data: buildTeamSentinel(99n) });
    await expect(
      prisma.team.create({ data: buildTeamSentinel(99n) })
    ).rejects.toThrow();
  });
});
