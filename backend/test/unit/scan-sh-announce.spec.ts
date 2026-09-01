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
    const a = decideScanAnnouncement(scanner, target, false);
    expect(a.kind).toBe('SCAN2');
    expect(a.bearing).toBeGreaterThanOrEqual(0);
    expect(a.bearing).toBeLessThan(360);
  });

  it('SCAN3 when in range but the target has never scanned the scanner', () => {
    const target = { xcoord: 5.5, ycoord: 5, heading: 90, scanRange: 15_000 };
    expect(decideScanAnnouncement(scanner, target, false).kind).toBe('SCAN3');
  });

  it('SCAN1, naming the scanner, once the target knows who they are', () => {
    const target = { xcoord: 5.5, ycoord: 5, heading: 90, scanRange: 15_000 };
    const a = decideScanAnnouncement(scanner, target, true);
    expect(a.kind).toBe('SCAN1');
    expect(a.scannerName).toBe('Kestrel');
  });

  it('gives a bearing measured from the TARGET, not the scanner', () => {
    // C: `cbearing(&wptr->coord, &warsptr->coord, wptr->heading)` — the
    // scanned ship is told where the scanner is relative to ITS OWN heading.
    const east = decideScanAnnouncement(scanner, { xcoord: 9, ycoord: 5, heading: 0, scanRange: 1 }, false);
    const west = decideScanAnnouncement(scanner, { xcoord: 1, ycoord: 5, heading: 0, scanRange: 1 }, false);
    expect(east.bearing).not.toBe(west.bearing);
  });

  it('always produces an announcement — reconnaissance is never silent', () => {
    for (const known of [true, false]) {
      for (const scanRange of [0, 15_000, 1_000_000]) {
        const a = decideScanAnnouncement(scanner, { xcoord: 6, ycoord: 5, heading: 0, scanRange }, known);
        expect(['SCAN1', 'SCAN2', 'SCAN3']).toContain(a.kind);
      }
    }
  });
});
