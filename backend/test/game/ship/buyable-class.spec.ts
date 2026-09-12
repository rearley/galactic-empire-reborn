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

  it('bounds at cyb_class, not at the end of the table', () => {
    const buyable = SHIP_CLASSES.filter(isPlayerBuyableClass).map((c) => c.classNumber);
    expect(Math.max(...buyable)).toBeLessThan(FIRST_CPU_CLASS);
  });
});
