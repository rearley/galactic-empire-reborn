/**
 * ShipClass entity — FR-024..FR-027, SC-002, SC-004
 * @see reference/wiki/player-ships.md
 * @see reference/wiki/cpu-ships.md
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";
import { SHIP_CLASSES } from "../../prisma/seed/ship-classes";

const EXPECTED_CLASS_NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 34, 21, 22, 23, 24, 25, 31, 32, 33]);

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ShipClass entity", () => {
  it("seed has exactly 18 entries covering all class numbers", () => {
    expect(SHIP_CLASSES).toHaveLength(18);
    const classNums = new Set(SHIP_CLASSES.map((c) => c.classNumber));
    expect(classNums).toEqual(EXPECTED_CLASS_NUMBERS);
  });

  it("inserts all 18 ship classes and looks up each by classNumber (SC-004)", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const count = await prisma.shipClass.count();
    expect(count).toBe(18);

    for (const seed of SHIP_CLASSES) {
      const found = await prisma.shipClass.findUniqueOrThrow({
        where: { classNumber: seed.classNumber },
      });
      expect(found.typeName).toBe(seed.typeName);
      expect(found.shipNameTemplate).toBe(seed.shipNameTemplate);
      expect(found.category).toBe(seed.category);
      expect(found.maxShields).toBe(seed.maxShields);
      expect(found.maxPhaser).toBe(seed.maxPhaser);
      expect(found.hasTorpedo).toBe(seed.hasTorpedo);
      expect(found.hasMissile).toBe(seed.hasMissile);
      expect(found.hasDecoy).toBe(seed.hasDecoy);
      expect(found.hasJammer).toBe(seed.hasJammer);
      expect(found.hasZipper).toBe(seed.hasZipper);
      expect(found.hasMine).toBe(seed.hasMine);
      expect(found.canAttackPlanet).toBe(seed.canAttackPlanet);
      expect(found.hasCloak).toBe(seed.hasCloak);
      expect(found.maxAcceleration).toBe(seed.maxAcceleration);
      expect(found.maxWarp).toBe(seed.maxWarp);
      expect(found.maxTons).toBe(seed.maxTons);
      expect(found.maxPrice).toBe(seed.maxPrice);
      expect(found.scanRange).toBe(seed.scanRange);
      expect(found.points).toBe(seed.points);
      expect(found.damageFactor).toBe(seed.damageFactor);
      expect(found.cybCanAttack).toBe(seed.cybCanAttack);
      expect(found.cybLowestClassAttacks).toBe(seed.cybLowestClassAttacks);
      expect(found.noClaim).toBe(seed.noClaim);
      expect(found.make).toBe(seed.make);
      expect(found.tough).toBe(seed.tough);
    }
  });

  it("class 1 — Interceptor spot-check (spec acceptance scenario 1)", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const found = await prisma.shipClass.findUniqueOrThrow({ where: { classNumber: 1 } });
    expect(found.typeName).toBe("Interceptor");
    expect(found.maxShields).toBe(10);
    expect(found.maxPhaser).toBe(10);
    expect(found.hasTorpedo).toBe(true);
    expect(found.hasCloak).toBe(false);
    expect(found.maxAcceleration).toBe(5_000);
    expect(found.maxWarp).toBe(10);
    expect(found.maxTons).toBe(1_000);
    expect(found.maxPrice).toBe(65_000n);
    expect(found.scanRange).toBe(15_000);
    expect(found.points).toBe(750);
    expect(found.cybCanAttack).toBe(true);
    expect(found.cybLowestClassAttacks).toBe(1);
    expect(found.damageFactor).toBe(90);
  });

  it("class 22 — Cyberquad spot-check (spec acceptance scenario 2)", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const found = await prisma.shipClass.findUniqueOrThrow({ where: { classNumber: 22 } });
    expect(found.typeName).toBe("Cybertron Battle Cruiser");
    expect(found.category).toBe("CPU_COMBATIVE");
    expect(found.make).toBe(5);
    expect(found.tough).toBe(1);
  });

  it("class 32 — Murdonian Transport spot-check (spec acceptance scenario 3)", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const found = await prisma.shipClass.findUniqueOrThrow({ where: { classNumber: 32 } });
    expect(found.typeName).toBe("Murdonian Transport");
    expect(found.category).toBe("CPU_DROID");
    expect(found.maxShields).toBe(2);
    expect(found.maxPhaser).toBe(5);
    expect(found.make).toBe(2);
    expect(found.tough).toBe(0);
    expect(found.damageFactor).toBe(100);
  });

  it("class 34 — Sysopian Death Star spot-check", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const found = await prisma.shipClass.findUniqueOrThrow({ where: { classNumber: 34 } });
    expect(found.maxWarp).toBe(255);
    expect(found.maxTons).toBe(100_000_000);
    expect(found.maxPrice).toBe(32_000_000n);
  });

  it("rejects duplicate classNumber", async () => {
    await prisma.shipClass.createMany({ data: SHIP_CLASSES as never[] });
    const dupe = { ...SHIP_CLASSES[0] };
    await expect(prisma.shipClass.create({ data: dupe as never })).rejects.toThrow();
  });
});
