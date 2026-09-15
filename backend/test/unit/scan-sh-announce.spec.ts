/**
 * Scanning a ship tells that ship it was scanned.
 *
 * GECMDS.C:2261-2280 — `scan_sh` ALWAYS sends the scanned ship one of three
 * messages, via `outprfge(FILTER, shpnum)`:
 *
 *   ddistance > shipclass[wptr->shpclass].scanrange -> SCAN2(bearing)
 *     "something scanned you from a bearing you cannot see"
 *   ltr == '?'  (in his range, but he has never scanned you) -> SCAN3(bearing)
 *   otherwise                                                -> SCAN1(letter, scanner's shipname)
 *
 * The port returned only `lines` — reconnaissance was completely free and
 * silent, and SCAN1/2/3 appeared nowhere in the backend. Being looked at is
 * information, and in the original you get it.
 *
 * @see GECMDS.C:2261-2280
 */

import { decideScanAnnouncement } from '../../src/game/commands/scan-announce';

const scanner = { shipname: 'Kestrel', xcoord: 5, ycoord: 5, heading: 0 };

describe('decideScanAnnouncement — GECMDS.C:2261-2280', () => {
  it('SCAN2 when the scanner is beyond the target\'s own scan range', () => {
    // Target scans 15_000 raw units (1.5 sectors); the scanner is 4 away.
    const target = { xcoord: 9, ycoord: 5, heading: 90, scanRange: 15_000 };
    const a = decideScanAnnouncement(scanner, target, null);
    expect(a.kind).toBe('SCAN2');
    expect(a.bearing).toBeGreaterThanOrEqual(0);
    expect(a.bearing).toBeLessThan(360);
  });

  it('SCAN3 when in range but the target has never scanned the scanner', () => {
    const target = { xcoord: 5.5, ycoord: 5, heading: 90, scanRange: 15_000 };
    expect(decideScanAnnouncement(scanner, target, null).kind).toBe('SCAN3');
  });

  it('SCAN1, naming the scanner, once the target knows who they are', () => {
    const target = { xcoord: 5.5, ycoord: 5, heading: 90, scanRange: 15_000 };
    const a = decideScanAnnouncement(scanner, target, 'K');
    expect(a.kind).toBe('SCAN1');
    expect(a.scannerName).toBe('Kestrel');
  });

  it('gives a bearing measured from the TARGET, not the scanner', () => {
    // C: `cbearing(&wptr->coord, &warsptr->coord, wptr->heading)` — the
    // scanned ship is told where the scanner is relative to ITS OWN heading.
    const east = decideScanAnnouncement(scanner, { xcoord: 9, ycoord: 5, heading: 0, scanRange: 1 }, null);
    const west = decideScanAnnouncement(scanner, { xcoord: 1, ycoord: 5, heading: 0, scanRange: 1 }, null);
    expect(east.bearing).not.toBe(west.bearing);
  });

  it('always produces an announcement — reconnaissance is never silent', () => {
    for (const known of ['K', null] as const) {
      for (const scanRange of [0, 15_000, 1_000_000]) {
        const a = decideScanAnnouncement(scanner, { xcoord: 6, ycoord: 5, heading: 0, scanRange }, known);
        expect(['SCAN1', 'SCAN2', 'SCAN3']).toContain(a.kind);
      }
    }
  });
});

/**
 * SCAN1 takes TWO fields, and the port was passing one.
 *
 *   prfmsg(SCAN1, ltr, warsptr->shipname);   @see GECMDS.C:2277
 *
 * `SCAN1` is `'***\nSir! We are being scanned by Ship %c, The %s.'` — a scantab
 * LETTER and then the scanner's hull name. The port passed `scannerName` alone,
 * so the name landed in `%c` (rendering as its first character) and `%s` got
 * nothing. A player was told, on 2026-09-15:
 *
 *     Sir! We are being scanned by Ship B, The .
 *
 * The letter was never carried at all: the caller computed whether the target
 * knew the scanner by finding the scantab entry, then threw the entry away and
 * kept the boolean. Canon's own test is `ltr == '?'`, so the letter IS the
 * condition — carrying it makes the missing field and the branch the same
 * thing.
 */
describe('SCAN1 names the ship by letter AND hull', () => {
  const scanner = { shipname: 'Bellerophon', xcoord: 0, ycoord: 0 };
  const target = { xcoord: 0, ycoord: 0.01, heading: 0, scanRange: 100_000 };

  it('carries the letter the scanned pilot knows the scanner by', () => {
    const a = decideScanAnnouncement(scanner, target, 'B');
    expect(a.kind).toBe('SCAN1');
    expect(a.letter).toBe('B');
    expect(a.scannerName).toBe('Bellerophon');
  });

  it('falls back to SCAN3 when there is no letter — canon’s `ltr == \'?\'`', () => {
    expect(decideScanAnnouncement(scanner, target, null).kind).toBe('SCAN3');
  });

  it('treats an explicit ? as no letter', () => {
    // Scantab stores '?' for a contact that has never been identified, and
    // canon branches on exactly that value rather than on absence.
    expect(decideScanAnnouncement(scanner, target, '?').kind).toBe('SCAN3');
  });

  it('still reports out-of-range before anything else', () => {
    const far = { ...target, scanRange: 1 };
    expect(decideScanAnnouncement(scanner, far, 'B').kind).toBe('SCAN2');
  });
});
