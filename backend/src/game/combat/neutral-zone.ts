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
/**
 * Owner recorded on the five neutral-zone trading posts.
 *
 * C creates them already owned (GEPLANET.C:671, 737 copy `s00[idx].owner`), so
 * every ownership rule protects them without a special case. Leaving them
 * unowned meant `trans_up` — faithful to C's "you must own this planet or
 * NOBODY must own it" (GECMDS.C:3374) — let any pilot haul away stock the
 * midnight job restocks to 1,032,000 of every item.
 *
 * The `**...**` form is C's own convention for system-held records ("**Free**"
 * marks an abandoned planet) and cannot collide with a `usr_<hex>` player id.
 */
export const NEUTRAL_ZONE_OWNER = '**neutral**';

export const NEUTRAL_ZONE_SECTOR = Object.freeze({ x: 0, y: 0 });

/**
 * Player-facing name for the holder of the neutral-zone trading posts.
 *
 * `NEUTRAL_ZONE_OWNER` is an internal sentinel and has no `User` row, so any
 * screen that resolved it through the user table fell back to printing the
 * raw `**neutral**` at the pilot. C had no such problem: its neutral owner was
 * a sysop-configured display string (`s00[i].owner`, GEMAIN.C:919) that was
 * always meant to be read by a human.
 */
export const NEUTRAL_ZONE_OWNER_DISPLAY = 'Neutral Zone Authority';

/** True when a planet's `userid` is the neutral-zone sentinel. */
export function isNeutralZoneOwner(userid: string | null | undefined): boolean {
  return userid === NEUTRAL_ZONE_OWNER;
}

/**
 * Suffix for a planet in a sector listing.
 *
 * A trading post and a rival's colony are not the same thing to a pilot
 * choosing where to fly, so they must not share a label.
 */
export function planetOwnerLabel(userid: string | null | undefined): string {
  if (!userid) return '';
  return isNeutralZoneOwner(userid) ? ' — trading post' : ' — owned';
}
