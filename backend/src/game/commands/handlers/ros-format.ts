/**
 * Roster row selection and formatting.
 *
 * GECMDS.C:4037-4043 gates each row on
 *
 *   tmpusr.score > 0 && userid[0] != KEY[0] && userid[0] != '@'
 *
 * The port dropped the `score > 0` test, so every dormant account padded the
 * board — which is why the roster filled with never-flown `e2e_*` rows on the
 * shared development database — and printed `population` raw where C prints
 * millions to three decimals.
 */

export interface RosterCandidate {
  userid: string;
  score: bigint;
  population: number | bigint;
}

/** Rows that belong on the board. @see GECMDS.C:4038 */
export function rosterRows<T extends RosterCandidate>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.score > 0n && !r.userid.startsWith('@'));
}

/**
 * `sprintf(gechrbuf2, " %8.3fm", ((float)tmpusr.population)/100.0)` — the
 * counter is hundredths of a million.
 *
 * @see GECMDS.C:4043
 */
export function formatPopulation(population: number | bigint): string {
  // C's format string is `" %8.3fm"` — leading space, 8-wide number, then the
  // unit. Ten characters in all, which is what the roster columns align to.
  return ` ${(Number(population) / 100).toFixed(3).padStart(8)}m`;
}
