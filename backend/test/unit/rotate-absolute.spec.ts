import { parseRotation } from '../../src/game/commands/handlers/helpers/rotation';
import { resultingHeading } from '../../src/game/commands/handlers/helpers/rotation';

/**
 * C's `cmd_rotate` takes TWO forms (GECMDS.C:643):
 *
 *   rot @<deg>   `if (*margv[1] == '@')` — turn ABSOLUTE, 0..359.
 *   rot <deg>    via valdegree — turn RELATIVE, -180..180.
 *
 * This port implemented only the relative one, so `rot @208` was rejected as
 * "Number out of range (-180-180)". That matters because the absolute form is
 * the command that CONSUMES a scan bearing: `sca pl 1` answers "Bearing: 208",
 * and 208 cannot be a relative turn. Without `@` there was no way to steer
 * onto a bearing the game had just told you, and more than half the compass
 * was unreachable in one order.
 */
describe('parseRotation', () => {
  it('reads the absolute form C spells with a leading @', () => {
    expect(parseRotation('@208')).toEqual({ ok: true, absolute: true, deg: 208 });
    expect(parseRotation('@0')).toEqual({ ok: true, absolute: true, deg: 0 });
    expect(parseRotation('@359')).toEqual({ ok: true, absolute: true, deg: 359 });
  });

  it('rejects an absolute heading outside the compass', () => {
    // C: `if (deg < 360)` else NUMOOR(0,359).
    expect(parseRotation('@360')).toEqual({ ok: false, code: 'NUMOOR', lo: 0, hi: 359 });
    expect(parseRotation('@1000')).toEqual({ ok: false, code: 'NUMOOR', lo: 0, hi: 359 });
  });

  it('reads the relative form, which is the bare number', () => {
    expect(parseRotation('90')).toEqual({ ok: true, absolute: false, deg: 90 });
    expect(parseRotation('-180')).toEqual({ ok: true, absolute: false, deg: -180 });
  });

  it('rejects a relative turn outside valdegree, quoting valdegree\'s range', () => {
    // C's valdegree prints NUMOOR(-180,180) — GEFUNCS.C:1933.
    expect(parseRotation('208')).toEqual({ ok: false, code: 'NUMOOR', lo: -180, hi: 180 });
    expect(parseRotation('nonsense')).toEqual({ ok: false, code: 'NUMOOR', lo: -180, hi: 180 });
  });
});

/**
 * C prints the heading you will END UP on, not the delta you asked for:
 * `deg = (unsigned)normal(heading + degrees); prfmsg(NOWTURN,deg)`. The port
 * printed the delta, so `rot 90` from heading 101 answered "Now turning to 90
 * degrees" while actually turning to 191 — the one number the pilot needed was
 * the one it did not show.
 */
describe('resulting heading', () => {

  it('is the sum for a relative turn, normalised', () => {
    expect(resultingHeading(101, { absolute: false, deg: 90 })).toBe(191);
    expect(resultingHeading(300, { absolute: false, deg: 120 })).toBe(60);
    expect(resultingHeading(10, { absolute: false, deg: -30 })).toBe(340);
  });

  it('is the argument itself for an absolute turn', () => {
    expect(resultingHeading(101, { absolute: true, deg: 208 })).toBe(208);
  });
});
