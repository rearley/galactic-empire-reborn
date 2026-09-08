import { CybertronControlService } from '../../../src/game/cybertron/cybertron-control.service';

/**
 * `sys cybpause nnn` has to actually stop the AI, or it is a switch wired to
 * nothing — which is precisely the failure `set scanfull` had.
 *
 * Canon decrements a global `cybhaltflg` in the tick (GECMDS.C:4972 sets it).
 * This port stores an expiry instant instead, so the pause ends on its own
 * whether or not a tick ran, and a restart clears it — the safe direction for
 * a switch whose ON state stops the game's only opposition.
 */
describe('the AI tick consults the pause switch', () => {
  it('reports paused while the window is open and running after it closes', () => {
    const c = new CybertronControlService();
    c.pauseFor(5, 1_000);
    expect(c.isPaused(1_000)).toBe(true);
    expect(c.isPaused(6_001)).toBe(false);
  });

  it('a fresh service is never paused, so a restart resumes the AI', () => {
    expect(new CybertronControlService().isPaused()).toBe(false);
  });
});
