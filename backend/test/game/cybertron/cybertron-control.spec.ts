import { CybertronControlService } from '../../../src/game/cybertron/cybertron-control.service';

/**
 * `sys cybpause nnn` — canon's cybhaltflg (GECMDS.C:4972). A sysop switch to
 * stop the AI while inspecting something, which has to expire on its own: a
 * pause that needs a second command to undo is a pause someone forgets.
 */
describe('CybertronControlService', () => {
  it('is not paused by default — the AI runs unless told otherwise', () => {
    expect(new CybertronControlService().isPaused()).toBe(false);
  });

  it('pauses for the requested seconds and expires on its own', () => {
    const c = new CybertronControlService();
    c.pauseFor(30, 1_000_000);
    expect(c.isPaused(1_000_000)).toBe(true);
    expect(c.isPaused(1_029_999)).toBe(true);
    expect(c.isPaused(1_030_000)).toBe(false);
  });

  it('treats zero or negative as "resume now", so it is its own off switch', () => {
    const c = new CybertronControlService();
    c.pauseFor(60, 1_000_000);
    c.pauseFor(0, 1_000_000);
    expect(c.isPaused(1_000_000)).toBe(false);
  });

  it('reports the seconds it actually applied', () => {
    expect(new CybertronControlService().pauseFor(45)).toBe(45);
    expect(new CybertronControlService().pauseFor(-5)).toBe(0);
  });

  it('reports remaining time, floored at zero', () => {
    const c = new CybertronControlService();
    c.pauseFor(10, 1_000_000);
    expect(c.remaining(1_004_000)).toBe(6);
    expect(c.remaining(2_000_000)).toBe(0);
  });
});
