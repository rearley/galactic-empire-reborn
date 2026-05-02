import {
  ACCENGAMT,
  COORD_SCALE,
  MAXX,
  MAXY,
  MOVENGMIN,
  MOVENGUSE,
  ROTENGUSE,
  TICKTIME,
  WARP_THRESHOLD,
} from '../../../src/game/constants';
import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';

/**
 * Pins every game-balance constant consumed by the 006a physics tick. If the
 * value of any constant changes (whether on accident or by design), this test
 * fails and forces an explicit, deliberate update — see FR-016, SC-005.
 *
 * Also pins the sum-of-classes for `maxAcceleration` and `maxWarp` against the
 * ShipClass seed catalog; any class re-tuning trips the test.
 *
 * @see GEMAIN.H balance constants
 * @see GEFUNCS.C — ACCENGAMT, MOVENGUSE, MOVENGMIN, COORD_SCALE call sites
 */
describe('006a balance regression', () => {
  it('TICKTIME is 6 (GEMAIN.H:133)', () => expect(TICKTIME).toBe(6));
  it('ACCENGAMT is 120 (GEMAIN.H:76)', () => expect(ACCENGAMT).toBe(120));
  it('MOVENGUSE is 10 (GEMAIN.H:78)', () => expect(MOVENGUSE).toBe(10));
  it('MOVENGMIN is 3000 (GEMAIN.H:77)', () => expect(MOVENGMIN).toBe(3000));
  it('ROTENGUSE is 30 (GEMAIN.H:73)', () => expect(ROTENGUSE).toBe(30));
  it('WARP_THRESHOLD is 1000 (GEFUNCS.C:482, 493, 538)', () => expect(WARP_THRESHOLD).toBe(1000));
  it('COORD_SCALE is 65000 (GEFUNCS.C:648-649)', () => expect(COORD_SCALE).toBe(65000));
  it('MAXX is 30 (GEMAIN.H:121)', () => expect(MAXX).toBe(30));
  it('MAXY is 15 (GEMAIN.H:122)', () => expect(MAXY).toBe(15));

  describe('ShipClass seed catalog', () => {
    it('seed contains 18 ship-class entries', () => {
      expect(SHIP_CLASSES).toHaveLength(18);
    });

    it('sum of maxAcceleration across all classes is 72050', () => {
      const total = SHIP_CLASSES.reduce((s, c) => s + c.maxAcceleration, 0);
      expect(total).toBe(72050);
    });

    it('sum of maxWarp across all classes is 522', () => {
      const total = SHIP_CLASSES.reduce((s, c) => s + c.maxWarp, 0);
      expect(total).toBe(522);
    });
  });
});
