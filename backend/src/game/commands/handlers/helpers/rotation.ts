/**
 * Parses the argument to `rot`, which C accepts in two forms (GECMDS.C:643).
 *
 *   rot @<deg>   `if (*margv[1] == '@')` — turn ABSOLUTE to a compass heading,
 *                rejected at `deg < 360` with NUMOOR(0,359).
 *   rot <deg>    through `valdegree` — turn RELATIVE, NUMOOR(-180,180) on
 *                failure (GEFUNCS.C:1933).
 *
 * The absolute form is what consumes a bearing: every scan reports headings in
 * 0..359, and a number above 180 cannot be a relative turn. Without `@` a
 * pilot could not steer onto a bearing the game had just handed them.
 */

export interface RotationOk {
  ok: true;
  /** True for the `@` form — `deg` IS the new heading rather than a delta. */
  absolute: boolean;
  deg: number;
}

export interface RotationErr {
  ok: false;
  code: 'NUMOOR';
  /** Range to quote back, which differs between the two forms as it does in C. */
  lo: number;
  hi: number;
}

export type Rotation = RotationOk | RotationErr;

export function parseRotation(input: string): Rotation {
  const trimmed = (input ?? '').trim();

  if (trimmed.startsWith('@')) {
    const body = trimmed.slice(1);
    if (!/^\d+$/.test(body)) return { ok: false, code: 'NUMOOR', lo: 0, hi: 359 };
    const deg = parseInt(body, 10);
    // C: `if (deg < 360)`. `deg` is unsigned there, so negatives cannot arrive.
    if (deg >= 360) return { ok: false, code: 'NUMOOR', lo: 0, hi: 359 };
    return { ok: true, absolute: true, deg };
  }

  if (!/^-?\d+$/.test(trimmed)) return { ok: false, code: 'NUMOOR', lo: -180, hi: 180 };
  const deg = parseInt(trimmed, 10);
  if (deg < -180 || deg > 180) return { ok: false, code: 'NUMOOR', lo: -180, hi: 180 };
  return { ok: true, absolute: false, deg };
}

/**
 * The heading the ship will end up on — what C reports.
 *
 * `deg = (unsigned)normal(heading + degrees); prfmsg(NOWTURN,deg)` for the
 * relative form, and `head2b = deg` for the absolute one. Printing the delta
 * instead told a pilot turning from 101 by 90 that they were "turning to 90".
 */
export function resultingHeading(heading: number, r: { absolute: boolean; deg: number }): number {
  if (r.absolute) return r.deg;
  return Math.round((heading + r.deg + 360) % 360) % 360;
}
