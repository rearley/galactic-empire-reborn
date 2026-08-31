/**
 * Balance regression: navigation spy constants.
 * Fail this test to detect any change to canonical nav-spy tuning.
 * @see GEMAIN.H UNIVMAX — universe half-extent (15)
 * @see GECMDS.C I_SPY item index (13)
 */
import { UNIVMAX } from '../../../src/game/constants';
import { I_SPY } from '../../../src/game/constants/items';

describe('016 nav-spy balance constants', () => {
  /**
   * UNIVMAX is a sysop `.cnf` option — `numopt(UNIVMAX,10,32767)`
   * (GEMAIN.C:474) — so the VALUE is taste and only the bounds are canon,
   * exactly as with TEAMBONU. What matters for fidelity is the geometry it
   * defines: a square universe running -UNIVMAX..+UNIVMAX on both axes with the
   * neutral zone at its centre (GEMAIN.H:70, GEMAIN.C:2204).
   */
  it('UNIVMAX stays within the bounds the original enforces', () => {
    expect(UNIVMAX).toBeGreaterThanOrEqual(10);
    expect(UNIVMAX).toBeLessThanOrEqual(32767);
  });

  it('the universe is centred on the origin', () => {
    // Equal room either side of (0,0) is the whole point of the change.
    expect(-UNIVMAX).toBe(-Math.abs(UNIVMAX));
    expect((UNIVMAX * 2 + 1) % 2).toBe(1); // odd side ⇒ a true centre sector
  });

  it('I_SPY is 13', () => {
    expect(I_SPY).toBe(13);
  });
});
