import { isPlayerBuyableClass, FIRST_CPU_CLASS } from '../../../src/game/ship/buyable-class';
import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';

/**
 * The bound that keeps the Death Star out of the shop.
 * @see issue #21
 */
describe('isPlayerBuyableClass', () => {
  it('accepts a PLAYER class below cyb_class', () => {
    expect(isPlayerBuyableClass({ classNumber: 1, category: 'PLAYER' })).toBe(true);
  });

  it('refuses the Sysopian Death Star even though the table calls it PLAYER', () => {
    const deathStar = SHIP_CLASSES.find((c) => c.classNumber === 41);
    expect(deathStar?.category).toBe('PLAYER');
    expect(isPlayerBuyableClass(deathStar!)).toBe(false);
  });

  it('refuses a CYBORG or DROID class', () => {
    for (const n of [21, 31, 33]) {
      const row = SHIP_CLASSES.find((c) => c.classNumber === n)!;
      expect(isPlayerBuyableClass(row)).toBe(false);
    }
  });

  it('refuses a missing class rather than throwing', () => {
    expect(isPlayerBuyableClass(null)).toBe(false);
    expect(isPlayerBuyableClass(undefined)).toBe(false);
  });

  /**
   * The bound itself, read off canon rather than restated.
   *
   * Canon does not hardcode 21. It walks the loaded class table and stops at
   * the first CYBORG entry — GEMAIN.C:882 `cyb_class = i;` — so `cyb_class` is
   * whatever that table says. `FIRST_CPU_CLASS` is the one transcribed number in this area, and the
   * test that used to stand here filtered the table WITH it and then asserted
   * the result was below it, which holds for any value it could ever take.
   * This derives the same number from the generated table, so a re-extraction
   * that moves the first cyborg moves the assertion with it.
   */
  it('equals the first non-PLAYER class in the generated table', () => {
    const firstNonPlayer = [...SHIP_CLASSES]
      .sort((a, b) => a.classNumber - b.classNumber)
      .find((c) => c.category !== 'PLAYER');

    expect(firstNonPlayer?.classNumber).toBe(FIRST_CPU_CLASS);
  });

  it('bounds at cyb_class, not at the end of the table', () => {
    const buyable = SHIP_CLASSES.filter(isPlayerBuyableClass).map((c) => c.classNumber);
    expect(Math.max(...buyable)).toBeLessThan(FIRST_CPU_CLASS);
  });
});
