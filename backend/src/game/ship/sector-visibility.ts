/** Integer sector coordinates — the whole-number part of a ship's position. */
export interface SectorCoord {
  x: number;
  y: number;
}

/** The sector a ship is standing in. Canon's `setsect`. @see GEFUNCS.C setsect */
export function sectorOf(ship: { xcoord: number; ycoord: number }): SectorCoord {
  return { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) };
}

/**
 * Whether a viewer may be told WHERE another ship is.
 *
 * Canon has no command that reveals a live player's position. `who`
 * (GECMDS.C:5162) prints your own BBS id back at you and nothing else; `ros`
 * (cmd_geroster, GECMDS.C:4008) lists userid, score, kills, planets and
 * population, with no coordinates anywhere. Position came from `sca`, which is
 * gated on your scan range AND fires SCAN1/SCAN2/SCAN3 at the target so they
 * know they were looked at, or from `spy`.
 *
 * Our `who` and the client's player panel both printed every player's exact
 * sector, live, at unlimited range and in silence — free intelligence canon
 * never granted, and it left `sca` with nothing to offer against a player.
 *
 * The rule: you see a position only for someone in your own sector, where a
 * scan would have shown them anyway. Everyone else is a name on a list.
 * Deliberate deviation both ways — canon shows no positions at all — kept
 * because the panel is otherwise empty in a small galaxy.
 */
export function sectorVisibleTo(viewer: SectorCoord, subject: SectorCoord): boolean {
  return viewer.x === subject.x && viewer.y === subject.y;
}
