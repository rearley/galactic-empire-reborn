/**
 * Distance as the scans report it: raw units, the same scale as `nav`.
 *
 * `ddistance = cdistance(&a,&b)*10000; prfmsg(SCAN10,bearing,
 *  spr("%ld",(long)ddistance));` — C prints a whole number of units
 * (GECMDS.C:2325), and the `(long)` cast truncates.
 *
 * The port printed sector units to two decimals, so one digit covered a
 * 100-unit band while `orb` refuses beyond 250 — a pilot closing on a planet
 * could not tell whether "0.03" was inside the gate or well outside it.
 */
export function scanDistanceUnits(sectorUnits: number): number {
  return Math.trunc(sectorUnits * 10_000);
}
