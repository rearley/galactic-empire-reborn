/**
 * Balance regression tests — pins NUMITEMS, PLANTOCK_SECONDS, PLANTIME_MIN_SECONDS,
 * and the five frozen item arrays. Any edit to a value fails this test (FR-028).
 */
import {
  NUMITEMS,
  ITEM_NAMES,
  BASEPRICE,
  MANHOURS,
  MAXPL,
  ITEM_TONS,
} from '../../src/game/constants/items';
import { PLANTOCK_SECONDS, PLANTIME_MIN_SECONDS } from '../../src/game/constants';

describe('balance-planet — regression pins', () => {
  it('NUMITEMS === 14', () => {
    expect(NUMITEMS).toBe(14);
  });

  it('PLANTOCK_SECONDS === 1800', () => {
    expect(PLANTOCK_SECONDS).toBe(1800);
  });

  it('PLANTIME_MIN_SECONDS === 4', () => {
    expect(PLANTIME_MIN_SECONDS).toBe(4);
  });

  it('ITEM_NAMES snapshot', () => {
    expect(ITEM_NAMES).toEqual([
      'Men', 'Missiles', 'Torpedoes', 'Ion Cannons', 'Flux Pods', 'Food Cases',
      'Fighters', 'Decoys', 'Troops', 'Zippers', 'Jammers', 'Mines', 'Gold', 'Spies',
    ]);
  });

  it('BASEPRICE snapshot', () => {
    expect(BASEPRICE).toEqual([2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 100, 100]);
  });

  it('MANHOURS snapshot', () => {
    expect(MANHOURS).toEqual([3500, 300, 500, 4, 200, 8000, 100, 900, 200, 100, 300, 500, 30, 20]);
  });

  it('MAXPL snapshot', () => {
    expect(MAXPL).toEqual([
      1_000_000_000,
         50_000_000,
         50_000_000,
            500_000,
         20_000_000,
        100_000_000,
            500_000,
         50_000_000,
         20_000_000,
         50_000_000,
         20_000_000,
         50_000_000,
          5_000_000,
             10_000,
    ]);
  });

  it('ITEM_TONS snapshot', () => {
    expect(ITEM_TONS).toEqual([1, 5, 3, 250, 20, 2, 15, 3, 2, 5, 4, 5, 0.5, 1]);
  });

  it('all frozen arrays have length NUMITEMS', () => {
    expect(ITEM_NAMES.length).toBe(NUMITEMS);
    expect(BASEPRICE.length).toBe(NUMITEMS);
    expect(MANHOURS.length).toBe(NUMITEMS);
    expect(MAXPL.length).toBe(NUMITEMS);
    expect(ITEM_TONS.length).toBe(NUMITEMS);
  });
});
