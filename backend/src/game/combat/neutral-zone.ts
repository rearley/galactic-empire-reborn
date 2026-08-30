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

/**
 * The origin SECTOR — distinct from the neutral-zone coordinate bubble above.
 *
 * `isInNeutralZone` tests a ±0.5 bubble around the origin, which is what the
 * combat rules use. Sector membership is `Math.floor(coord) === 0`, a larger
 * area: the five neutral-zone planets sit at 0.2..0.8 on each axis, inside
 * sector 0,0 but mostly OUTSIDE the combat bubble.
 *
 * Use this for rules about the sector (for example, nothing here is
 * claimable); use isInNeutralZone for rules about the protected bubble.
 */
export const NEUTRAL_ZONE_SECTOR = Object.freeze({ x: 0, y: 0 });
