import { SSMAX } from '../constants';

/**
 * Sector index containing a universe coordinate.
 *
 * `return ((int)floor(dcoord));`
 * @see GECMDS.C:3102 coord1
 */
export function coord1(dcoord: number): number {
  return Math.floor(dcoord);
}

/**
 * Position INSIDE the sector `coord1` names, in 1/SSMAX units, always [0, SSMAX).
 *
 * `d2 = modf(1 + modf(dcoord, &d1), &d1); return (unsigned)(d2 * SSMAX);`
 *
 * C's leading `1 +` is what keeps this in range for negative coordinates:
 * `modf` returns a fraction carrying the sign of its argument, so -9.24 yields
 * -0.24, and adding 1 lifts it to 0.76 — the same value as
 * `dcoord - floor(dcoord)`, which is what makes it agree with `coord1`.
 * JS `%` has the identical sign behaviour and needs the identical correction.
 *
 * @see GECMDS.C:3088 coord2
 */
export function coord2(dcoord: number): number {
  return Math.floor((dcoord - Math.floor(dcoord)) * SSMAX);
}
