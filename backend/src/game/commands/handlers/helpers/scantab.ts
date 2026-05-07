import { ShipState } from '../../../ship/ship-state.types';

/** Maximum number of scantab slots — widened to full alphabet (vs. original 15). */
const NOSCANTAB = 26;

/**
 * One entry in the per-player scantab — represents a visible ship.
 * @see GEMAIN.H WARSHP scantab array
 */
export interface ScantabEntry {
  /** Composite ship identity: `${userid}#${shipno}`. */
  shipKey: string;
  /** Distance in raw units: Euclidean distance × 10000 (matches C ddistance). */
  dist: number;
  /** Sticky letter A..Z assigned to this ship. */
  letter: string;
  /** Bearing from self to other, 0..359 degrees. */
  bearing: number;
  /** Other ship's current heading, 0..359 degrees. */
  heading: number;
  /** Other ship's current speed (raw). */
  speed: number;
  /** Occupied slot flag — always 1 in a built scantab. */
  flag: 0 | 1;
}

/** The full per-player scantab — an ordered array of up to 26 visible ships. */
export type Scantab = ScantabEntry[];

/**
 * Compose the canonical ship key used in ScantabEntry.shipKey.
 * Uses `#` separator (distinct from ShipState shipKey helper which uses `:`).
 */
function makeKey(userid: string, shipno: number): string {
  return `${userid}#${shipno}`;
}

/**
 * Calculate the Euclidean distance in raw units (× 10000) between two ships.
 * Matches the C `ddistance` helper.
 * @see GEFUNCS.C ddistance
 */
function calcDist(self: ShipState, other: ShipState): number {
  const dx = other.xcoord - self.xcoord;
  const dy = other.ycoord - self.ycoord;
  return Math.sqrt(dx * dx + dy * dy) * 10_000;
}

/**
 * Calculate bearing from self to other in degrees (0..359).
 * @see GECMDS.C:2822
 */
function calcBearing(self: ShipState, other: ShipState): number {
  const dx = other.xcoord - self.xcoord;
  const dy = other.ycoord - self.ycoord;
  return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
}

/**
 * Builds the per-player scantab — stable letter assignments for all ships in range.
 *
 * Letter assignment is "sticky": if a ship appeared in the previous scantab it
 * keeps the same letter. New ships (or ships that left and re-entered range) are
 * assigned the next unused letter in A..Z order, sorted by ascending distance
 * within the new-ship subset.
 *
 * @param self      The observing ship.
 * @param allShips  All currently active ships (including self).
 * @param prev      The previous scantab for this player (null on first scan).
 * @param scanRange Maximum detection distance in raw units (same scale as dist).
 *                  Ships at dist >= scanRange are excluded.
 * @returns         A new Scantab sorted by ascending dist, at most 26 entries.
 *
 * @see GECMDS.C:2785 update_scantab
 * @see GECMDS.C:2895 pick_letter
 */
export function buildScantab(
  self: ShipState,
  allShips: ReadonlyArray<ShipState>,
  prev: Scantab | null,
  scanRange: number,
): Scantab {
  const selfKey = makeKey(self.userid, self.shipno);

  // Step 1: filter qualifying ships.
  type Candidate = { ship: ShipState; dist: number; key: string };
  const candidates: Candidate[] = [];
  for (const ship of allShips) {
    const key = makeKey(ship.userid, ship.shipno);
    if (key === selfKey) continue;         // exclude self
    if (ship.cloak >= 10) continue;        // exclude cloaked
    const dist = calcDist(self, ship);
    if (dist >= scanRange) continue;       // exclude out of range
    candidates.push({ ship, dist, key });
  }

  // Step 2: sort ascending by dist; if >26, keep nearest 26.
  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates.slice(0, NOSCANTAB);

  // Step 3: build a lookup from the previous scantab for sticky assignment.
  const prevMap = new Map<string, string>(); // shipKey -> letter
  if (prev !== null) {
    for (const entry of prev) {
      if (entry.flag === 1) {
        prevMap.set(entry.shipKey, entry.letter);
      }
    }
  }

  // Step 4: assign letters — sticky first, then fill remaining in A..Z order.
  // Track which letters are already claimed by sticky assignments.
  const usedLetters = new Set<string>();
  const assignments = new Map<string, string>(); // shipKey -> letter

  for (const { key } of nearest) {
    const sticky = prevMap.get(key);
    if (sticky !== undefined) {
      assignments.set(key, sticky);
      usedLetters.add(sticky);
    }
  }

  // Build the pool of available letters in order.
  const availableLetters: string[] = [];
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i); // 'A'..'Z'
    if (!usedLetters.has(letter)) {
      availableLetters.push(letter);
    }
  }

  // Assign to new ships in ascending dist order (nearest gets the lowest unused letter).
  let letterIdx = 0;
  for (const { key } of nearest) {
    if (!assignments.has(key)) {
      assignments.set(key, availableLetters[letterIdx++]);
    }
  }

  // Step 5: build the result array, sorted by ascending dist.
  const result: Scantab = nearest.map(({ ship, dist, key }) => ({
    shipKey: key,
    dist,
    letter: assignments.get(key)!,
    bearing: calcBearing(self, ship),
    heading: ship.heading,
    speed: ship.speed,
    flag: 1,
  }));

  return result;
}
