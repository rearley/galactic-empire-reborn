import { Random } from '../combat/random.port';

/**
 * Planet beacons — the message a colony broadcasts to ships in its sector.
 *
 * `adm beacon <message>` has always stored the text; nothing ever showed it,
 * so the command advertised a feature that did nothing. That is worse than a
 * missing feature, because it looks implemented.
 *
 * @see GEFUNCS.C:808-813 — the sector check and the roll
 * @see GEMAIN.C:1813-1831 — the printability validation on sector load
 */

/** `gernd()%10 == 0` — GEFUNCS.C:811. */
export const BEACON_ODDS = 10;

/**
 * Canon validates the stored text on every sector load and BLANKS the beacon
 * if any character falls outside `' '..'~'` (GEMAIN.C:1817-1824).
 *
 * That is not fussiness about character sets: a beacon is written by one
 * player and rendered to every other ship that flies past, so it is the one
 * place in the game where arbitrary text from a stranger reaches your screen.
 * The check stops a terminal escape sequence riding along with it. It matters
 * more in a browser than it did on a serial terminal, not less.
 */
export function isPrintableBeacon(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * Whether this tick is the one that shows the beacon.
 *
 * Deliberately occasional. Canon rolls 1-in-10 per tick rather than announcing
 * on arrival, so a beacon reads as a recurring hail from a colony you are
 * loitering near — not a banner that fires the instant you cross a boundary.
 */
export function shouldAnnounceBeacon(rand: Random): boolean {
  return Math.floor(rand.next() * BEACON_ODDS) === 0;
}
