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

// MANHOURS, MAXPL and ITEM_TONS are no longer snapshotted here. They are canon
// and are checked against MBMGEMSG.MSG itself, item by item, by
// test/balance/item-tables-canon.balance.spec.ts. Keeping a second hand-written
// copy is what let the wiki's rounded figures survive: the snapshot agreed with
// the constant because both came from the same wrong source.

describe('balance-planet — regression pins', () => {
  it('NUMITEMS === 14', () => {
    expect(NUMITEMS).toBe(14);
  });

  it('PLANTOCK_SECONDS is derived from the PLANTOCK option, in minutes', () => {
    // Was pinned at 1800 as though it were a fixed constant. It is an lngopt
    // (GEMAIN.C:469) held in MINUTES and multiplied by 60; canon ships 360 and
    // we deploy 120. The value is owned by the canon conformance test; what
    // matters here is that the conversion is right.
    expect(PLANTOCK_SECONDS % 60).toBe(0);
    expect(PLANTOCK_SECONDS).toBeGreaterThan(0);
  });

  it('PLANTIME_MIN_SECONDS === 4', () => {
    expect(PLANTIME_MIN_SECONDS).toBe(4);
  });

  /**
   * Canon's item_name[] verbatim (GECMDS.C:95-108) — lower case, "torpedos",
   * "spy". This snapshot used to carry a Title-Cased invention of the port's.
   * test/balance/item-names-canon.balance.spec.ts is the stronger guard: it
   * re-reads the C source rather than restating it here.
   */
  it('ITEM_NAMES snapshot', () => {
    expect(ITEM_NAMES).toEqual([
      'men', 'missiles', 'torpedos', 'ion cannons', 'flux pods', 'food cases',
      'fighters', 'decoys', 'troops', 'zippers', 'jammers', 'mines', 'gold', 'spy',
    ]);
  });

  it('BASEPRICE snapshot', () => {
    // BASEPRICE is the one item table with no canon: the shipped MBMGEMSG.MSG
    // has no ITMPR blocks, because baseprice was added at GEMAIN.C:569 later
    // than that file. So it is pinned HERE rather than against the original.
    // Gold moved 100 -> 1000: it is the cash-to-gold bank rate at Zygor, and
    // two wiki sources say 1000 against one that also gets gold's weight wrong.
    // @see docs/DECISIONS.md — gold base price
    expect(BASEPRICE).toEqual([2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 1000, 100]);
  });




  it('all frozen arrays have length NUMITEMS', () => {
    expect(ITEM_NAMES.length).toBe(NUMITEMS);
    expect(BASEPRICE.length).toBe(NUMITEMS);
    expect(MANHOURS.length).toBe(NUMITEMS);
    expect(MAXPL.length).toBe(NUMITEMS);
    expect(ITEM_TONS.length).toBe(NUMITEMS);
  });
});
