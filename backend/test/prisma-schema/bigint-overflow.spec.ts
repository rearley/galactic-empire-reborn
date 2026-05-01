/**
 * BigInt overflow regression — FR-036
 * Verifies every BigInt and BigInt[] column accepts values > 2^31 − 1.
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildUserSentinel, buildMailSentinel, buildMailStatSentinel } from "./helpers/sentinel-builders";
import { NUMITEMS } from "./helpers/constants";

const BIG = 9_999_999_999n; // > 2^31 − 1 (2_147_483_647)
const USER_ID = "bigintovfluser1234567890123456";

beforeEach(async () => {
  await truncateAll();
  await prisma.user.create({ data: buildUserSentinel(USER_ID) });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("BigInt overflow (FR-036)", () => {
  it("User: score, cash, debt, plscore, klscore, population, teamcode accept > 2^31", async () => {
    await prisma.user.update({
      where: { userid: USER_ID },
      data: { score: BIG, cash: BIG, debt: BIG, plscore: BIG, klscore: BIG, population: BIG, teamcode: BIG },
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { userid: USER_ID } });
    expect(u.score).toBe(BIG);
    expect(u.cash).toBe(BIG);
    expect(u.debt).toBe(BIG);
    expect(u.plscore).toBe(BIG);
    expect(u.klscore).toBe(BIG);
    expect(u.population).toBe(BIG);
    expect(u.teamcode).toBe(BIG);
  });

  it("Planet: cash, debt, tax, teamcode accept > 2^31", async () => {
    await prisma.planet.create({
      data: {
        xsect: 1, ysect: 1, plnum: 1,
        cash: BIG, debt: BIG, tax: BIG, teamcode: BIG,
        itemsQty: Array(NUMITEMS).fill(BIG),
        itemsRate: Array(NUMITEMS).fill(1),
        itemsSell: Array(NUMITEMS).fill(0),
        itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0),
        itemsSold2a: Array(NUMITEMS).fill(BIG),
      },
    });
    const p = await prisma.planet.findUniqueOrThrow({
      where: { xsect_ysect_plnum: { xsect: 1, ysect: 1, plnum: 1 } },
    });
    expect(p.cash).toBe(BIG);
    expect(p.debt).toBe(BIG);
    expect(p.tax).toBe(BIG);
    expect(p.teamcode).toBe(BIG);
    expect(p.itemsQty[0]).toBe(BIG);
    expect(p.itemsSold2a[0]).toBe(BIG);
  });

  it("Mail: msgno, long1/2/3 accept > 2^31", async () => {
    const s = { ...buildMailSentinel(USER_ID, 1, BIG), long1: BIG, long2: BIG, long3: BIG };
    await prisma.mail.create({ data: s });
    const m = await prisma.mail.findUniqueOrThrow({
      where: { userid_class_msgno: { userid: USER_ID, class: 1, msgno: BIG } },
    });
    expect(m.msgno).toBe(BIG);
    expect(m.long1).toBe(BIG);
    expect(m.long2).toBe(BIG);
    expect(m.long3).toBe(BIG);
  });

  it("MailStat: cash, debt, tax, itemqty[] accept > 2^31", async () => {
    const bigItems = Array(NUMITEMS).fill(BIG);
    const s = { ...buildMailStatSentinel(USER_ID, 3, BIG), cash: BIG, debt: BIG, tax: BIG, itemqty: bigItems };
    await prisma.mailStat.create({ data: s });
    const m = await prisma.mailStat.findUniqueOrThrow({
      where: { userid_class_msgno: { userid: USER_ID, class: 3, msgno: BIG } },
    });
    expect(m.cash).toBe(BIG);
    expect(m.debt).toBe(BIG);
    expect(m.tax).toBe(BIG);
    expect(m.itemqty[0]).toBe(BIG);
  });

  it("Team: teamcode, teamscore accept > 2^31", async () => {
    await prisma.team.create({
      data: { teamcode: BIG, teamname: "BigTeam", teamcount: 1, teamscore: BIG, password: "pass", secret: "secr", flag: 0 },
    });
    const t = await prisma.team.findUniqueOrThrow({ where: { teamcode: BIG } });
    expect(t.teamcode).toBe(BIG);
    expect(t.teamscore).toBe(BIG);
  });
});
