/**
 * MailStat entity (MAILSTAT) — FR-021
 * @see reference/ge-source/GEMAIN.H:531
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildMailStatSentinel, buildUserSentinel } from "./helpers/sentinel-builders";
import { NUMITEMS } from "./helpers/constants";

const USER_ID = "mailstatuser1234567890123456";

beforeEach(async () => {
  await truncateAll();
  await prisma.user.create({ data: buildUserSentinel(USER_ID) });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MailStat entity", () => {
  it("round-trips all MAILSTAT fields including itemqty BigInt array", async () => {
    const s = buildMailStatSentinel(USER_ID, 3, 1n);
    await prisma.mailStat.create({ data: s });
    const found = await prisma.mailStat.findUniqueOrThrow({
      where: { userid_class_msgno: { userid: USER_ID, class: 3, msgno: 1n } },
    });

    expect(found.type).toBe(s.type);
    expect(found.stamp).toBe(s.stamp);
    expect(found.dtime).toBe(s.dtime);
    expect(found.topic).toBe(s.topic);
    expect(found.name1).toBe(s.name1);
    expect(found.int1).toBe(s.int1);
    expect(found.int2).toBe(s.int2);
    expect(found.cash).toBe(s.cash);
    expect(found.debt).toBe(s.debt);
    expect(found.tax).toBe(s.tax);
    expect(found.itemqty).toHaveLength(NUMITEMS);
    expect(found.itemqty).toEqual(s.itemqty);
  });

  it("itemqty BigInt[] accepts values > 2^31 − 1 (FR-021, FR-037)", async () => {
    const bigItems = Array.from({ length: NUMITEMS }, (_, i) => BigInt(i + 1) * 9_999_999_999n);
    const s = { ...buildMailStatSentinel(USER_ID, 3, 2n), itemqty: bigItems };
    await prisma.mailStat.create({ data: s });
    const found = await prisma.mailStat.findUniqueOrThrow({
      where: { userid_class_msgno: { userid: USER_ID, class: 3, msgno: 2n } },
    });
    expect(found.itemqty).toEqual(bigItems);
  });

  it("enforces FK: creating mailStat for a non-existent user fails", async () => {
    const s = buildMailStatSentinel("nobody_xxxxxxxxxxxxxxxxxxxx", 3, 1n);
    await expect(prisma.mailStat.create({ data: s })).rejects.toThrow();
  });
});
