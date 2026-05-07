/**
 * Balance regression: navigation spy constants.
 * Fail this test to detect any change to canonical nav-spy tuning.
 * @see GEMAIN.H UNIVMAX — universe half-extent (15)
 * @see GECMDS.C I_SPY item index (13)
 */
import { UNIVMAX } from '../../../src/game/constants';
import { I_SPY } from '../../../src/game/constants/items';

describe('016 nav-spy balance constants', () => {
  it('UNIVMAX is 15', () => {
    expect(UNIVMAX).toBe(15);
  });

  it('I_SPY is 13', () => {
    expect(I_SPY).toBe(13);
  });
});
