/**
 * Balance regression: COUNTDOWN = 20 and DESTRUCT_SCORE_PENALTY pinned.
 * Fail this test to detect any change to canonical destruct tuning.
 * @see GECMDS.C:5025 cmd_destruct — canonical countdown start
 * @see GEFUNCS.C:1820 destruct — per-tick countdown
 */
import {
  COUNTDOWN,
  DESTRUCT_SCORE_PENALTY,
} from '../../src/game/commands/_ship-management-constants';

describe('destruct balance constants', () => {
  it('COUNTDOWN is 20 (canonical self-destruct tick count — 20 * 6s = 120s)', () => {
    expect(COUNTDOWN).toBe(20);
  });

  it('DESTRUCT_SCORE_PENALTY is 0 (self-destruct awards no score to attacker — no attacker)', () => {
    expect(DESTRUCT_SCORE_PENALTY).toBe(0);
  });

  it('COUNTDOWN * 6s = 120s total destruct window', () => {
    const tickSeconds = 6;
    expect(COUNTDOWN * tickSeconds).toBe(120);
  });
});
