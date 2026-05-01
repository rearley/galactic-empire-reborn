/**
 * Mail entity (MAIL) — FR-020, FR-022..FR-023
 * @see reference/ge-source/GEMAIN.H:511
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { buildMailSentinel, buildUserSentinel } from "./helpers/sentinel-builders";

const USER_ID = "mailspecusr1234567890123456789";

// Five known mail class constants from GEMAIN.H (FR-023)
const MAIL_CLASS_DISTRESS = 1;
const MAIL_CLASS_MAXOUT = 2;
const MAIL_CLASS_PRODRPT = 3;
const MAIL_CLASS_GAMESTATS = 4;
const MAIL_CLASS_PLSTATS = 5;

beforeEach(async () => {
  await truncateAll();
  await prisma.user.create({ data: buildUserSentinel(USER_ID) });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Mail entity", () => {
  it("round-trips all MAIL fields with non-default sentinel values", async () => {
    const s = buildMailSentinel(USER_ID, MAIL_CLASS_DISTRESS, 1n);
    await prisma.mail.create({ data: s });
    const found = await prisma.mail.findUniqueOrThrow({
      where: { userid_class_msgno: { userid: USER_ID, class: MAIL_CLASS_DISTRESS, msgno: 1n } },
    });

    expect(found.type).toBe(s.type);
    expect(found.stamp).toBe(s.stamp);
    expect(found.dtime).toBe(s.dtime);
    expect(found.topic).toBe(s.topic);
    expect(found.string1).toBe(s.string1);
    expect(found.name1).toBe(s.name1);
    expect(found.name2).toBe(s.name2);
    expect(found.int1).toBe(s.int1);
    expect(found.int2).toBe(s.int2);
    expect(found.int3).toBe(s.int3);
    expect(found.long1).toBe(s.long1);
    expect(found.long2).toBe(s.long2);
    expect(found.long3).toBe(s.long3);
  });

  it("accepts all five MAIL_CLASS_* constants (FR-023)", async () => {
    const classes = [
      MAIL_CLASS_DISTRESS,
      MAIL_CLASS_MAXOUT,
      MAIL_CLASS_PRODRPT,
      MAIL_CLASS_GAMESTATS,
      MAIL_CLASS_PLSTATS,
    ];
    for (const cls of classes) {
      await prisma.mail.create({
        data: buildMailSentinel(USER_ID, cls, BigInt(cls)),
      });
    }
    const count = await prisma.mail.count({ where: { userid: USER_ID } });
    expect(count).toBe(5);
  });

  it("rejects duplicate (userid, class, msgno) composite PK (FR-022)", async () => {
    const s = buildMailSentinel(USER_ID, 1, 1n);
    await prisma.mail.create({ data: s });
    await expect(prisma.mail.create({ data: s })).rejects.toThrow();
  });

  it("enforces FK: creating mail for a non-existent user fails (R-3)", async () => {
    const s = buildMailSentinel("nobody_xxxxxxxxxxxxxxxxxxxxxxxxx", 1, 1n);
    await expect(prisma.mail.create({ data: s })).rejects.toThrow();
  });

  it("inbox query orders by (class, msgno)", async () => {
    await prisma.mail.create({ data: buildMailSentinel(USER_ID, 3, 10n) });
    await prisma.mail.create({ data: buildMailSentinel(USER_ID, 1, 5n) });
    await prisma.mail.create({ data: buildMailSentinel(USER_ID, 2, 7n) });

    const inbox = await prisma.mail.findMany({
      where: { userid: USER_ID },
      orderBy: [{ class: "asc" }, { msgno: "asc" }],
    });
    expect(inbox[0].class).toBe(1);
    expect(inbox[1].class).toBe(2);
    expect(inbox[2].class).toBe(3);
  });
});
