/**
 * True if a coordinate lies in the neutral-zone origin sector.
 *
 * The C source `neutral()` tests `coord1(x)==0 && coord1(y)==0` where
 * `coord1` truncates toward the sector index. The origin sector spans
 * (−0.5, +0.5) on each axis in this port's sector-unit coordinates.
 *
 * @see GEFUNCS.C:neutral, GECMDS.C:937 (firep self-zap gate)
 */
export function isInNeutralZone(coord: { xcoord: number; ycoord: number }): boolean {
  return coord.xcoord > -0.5 && coord.xcoord < 0.5 && coord.ycoord > -0.5 && coord.ycoord < 0.5;
}
