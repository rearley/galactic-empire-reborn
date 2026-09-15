import { cdistance } from '../combat/combat-math';
import { cbearing } from '../physics/physics-math';

/** What the scanned ship is told. @see GECMDS.C:2261-2280 */
export type ScanAnnouncementKind =
  /** The scanner is beyond this ship's own scan range — a contact it cannot see. */
  | 'SCAN2'
  /** Within range, but this ship has never scanned the scanner, so it has no letter. */
  | 'SCAN3'
  /** Known contact — the scanner is named. */
  | 'SCAN1';

export interface ScanAnnouncement {
  kind: ScanAnnouncementKind;
  /** Bearing to the scanner, relative to the SCANNED ship's heading. */
  bearing: number;
  /** Present on SCAN1 only. */
  scannerName?: string;
  /**
   * The scantab letter the SCANNED ship knows the scanner by — SCAN1's `%c`.
   * Present on SCAN1 only, and it is also the branch condition: canon tests
   * `ltr == '?'`. @see GECMDS.C:2277 `prfmsg(SCAN1,ltr,warsptr->shipname);`
   */
  letter?: string;
}

/**
 * Decide what to tell a ship that has just been scanned.
 *
 *   if (ddistance > shipclass[wptr->shpclass].scanrange)
 *        prfmsg(SCAN2, bearing);
 *   else if (ltr == '?')  prfmsg(SCAN3, bearing);
 *   else                  prfmsg(SCAN1, ltr, warsptr->shipname);
 *   outprfge(FILTER, shpnum);
 *
 * C sends one of these EVERY time, so reconnaissance always costs you
 * something — the other pilot learns they are being looked at, and from
 * roughly where. The port sent nothing at all, and SCAN1/2/3 appeared nowhere
 * in the backend: scanning was free and silent.
 *
 * The bearing is computed from the SCANNED ship's position and heading
 * (`cbearing(&wptr->coord, &warsptr->coord, wptr->heading)`) — they are told
 * where the scanner is relative to their own nose, not the other way round.
 *
 * @see GECMDS.C:2261-2280 scan_sh
 */
export function decideScanAnnouncement(
  scanner: { shipname: string; xcoord: number; ycoord: number },
  target: { xcoord: number; ycoord: number; heading: number; scanRange: number },
  /**
   * The letter this target has the scanner filed under, or null/'?' if it has
   * never identified them. Canon branches on the LETTER rather than on a
   * boolean (`ltr == '?'`), and SCAN1 then prints it — passing a boolean is
   * what left `%c` to be filled by the ship name and `%s` by nothing.
   */
  targetsLetterForScanner: string | null,
): ScanAnnouncement {
  // Signed -180..180, from the TARGET's frame toward the scanner:
  // cbearing(&wptr->coord, &warsptr->coord, wptr->heading). This is the number
  // a hunted pilot turns on to face or flee the contact, so folding it to
  // 0..359 handed them a heading `rot` would refuse.
  // @see GELIB.C:142-166
  const bearing = Math.round(cbearing(target, scanner, target.heading));

  const distRaw = cdistance(target, scanner) * 10_000;
  if (distRaw > target.scanRange) return { kind: 'SCAN2', bearing };
  if (targetsLetterForScanner === null || targetsLetterForScanner === '?') {
    return { kind: 'SCAN3', bearing };
  }
  return {
    kind: 'SCAN1',
    bearing,
    letter: targetsLetterForScanner,
    scannerName: scanner.shipname,
  };
}
