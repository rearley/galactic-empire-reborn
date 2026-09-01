/** The five scan modes, by their canonical two-letter keyword. */
export type ScanSubcommand = 'lo' | 'sh' | 'pl' | 'ra' | 'se';

/**
 * C's keyword table for `cmd_scan`, in dispatch order.
 * @see GECMDS.C:2157-2172
 */
const SCAN_KEYWORDS: ReadonlyArray<[ScanSubcommand, string]> = [
  ['lo', 'local'],
  ['sh', 'ship'],
  ['pl', 'planet'],
  ['ra', 'range'],
  ['se', 'sector'],
];

/**
 * Resolve a scan sub-command by prefix, the way `genearas` does — so `sca
 * ship`, `sca planets` and `sca range 5` all work, not just the two-letter
 * abbreviations.
 *
 * Returns null for a bare `sca` and for anything unrecognised; the caller
 * prints SCANFMT, which is what C does rather than silently running a full
 * local scan.
 *
 * A partial shorter than the two-letter keyword does not match: `s` is
 * ambiguous between `sh` and `se`, and C compares against the whole keyword.
 *
 * @see GECMDS.C:2154, 2157-2172  @see GEFUNCS.C:2147 genearas
 */
export function resolveScanSubcommand(raw: string | undefined): ScanSubcommand | null {
  const input = (raw ?? '').toLowerCase();
  if (input.length < 2) return null;

  for (const [code, word] of SCAN_KEYWORDS) {
    // `sca sh`, `sca ship`, `sca shipname` — the input starts with the code,
    // or the full word starts with the input.
    if (input.startsWith(code) || word.startsWith(input)) return code;
  }
  return null;
}
