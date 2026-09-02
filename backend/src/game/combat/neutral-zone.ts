/**
 * True if a coordinate lies in the neutral zone — the whole of sector (0,0).
 *
 *   xsect = coord1(coord->xcoord);
 *   ysect = coord1(coord->ycoord);
 *   return (xsect == 0 && ysect == 0);
 *
 * `coord1` is floor (GECMDS.C:3102), so the zone is 0 <= x < 1 on each axis.
 *
 * This tested a ±0.5 bubble around the origin POINT instead, which is wrong at
 * both ends: it protected x in (-0.5, 0), which floors to sector -1, and left
 * x in [0.5, 1) exposed, which is squarely inside sector 0. The five trading
 * posts sit between 0.1 and 0.9, so most of the hub — the one place a new
 * pilot is meant to be safe — could be fired on. CybertronTickService had this
 * right all along with its own floor-based copy citing the same C line, so the
 * AI honoured a boundary the player weapons did not.
 *
 * @see GEPLANET.C:866 neutral, GECMDS.C:937 (firep self-zap gate)
 */
export function isInNeutralZone(coord: { xcoord: number; ycoord: number }): boolean {
  return Math.floor(coord.xcoord) === 0 && Math.floor(coord.ycoord) === 0;
}

/**
 * The origin sector's index, for rules that need the coordinates rather than a
 * membership test (for example, locating the trading posts).
 *
 * `isInNeutralZone` above is the membership test and now covers exactly this
 * sector; the two no longer describe different areas.
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
