/**
 * Canonical list of in-scope `set` options: every User.options[] byte that
 * the C source actually reads in a command or tick path.
 *
 * options[] index mapping (GEMAIN.H):
 *   0 → SCANNAMES — show ship names on scan overlay
 *   1 → SCANHOME  — overwrite (home) mode for scan render
 *   2 → SCANFULL  — show full detail panel on scan lo
 *   3 → MSG_FILTER — suppress non-critical server messages
 *
 * @see GECMDS.C:5197-5201 — cmd_set option reads
 * @see GEMAIN.H:233 SCANNAMES, :234 SCANHOME, :235 SCANFULL, :236 MSG_FILTER
 */
export interface SetOptionEntry {
  /** Command-line name passed to `set <name> on|off` */
  name: string;
  /** User.options[] byte index */
  optionsIndex: number;
  /** ShipState field name that mirrors this option in-memory */
  shipStateField: string;
  /**
   * What this option reads as when the player has never set it.
   *
   * Canon zeroes every byte, and that was right in 1988: a scan printed into
   * the same scrolling log as everything else, so extra detail cost you the
   * screen. This port draws scans into their own fixed panel that is on screen
   * either way, so SCANFULL off leaves an already-occupied region emptier for
   * a reason that no longer exists. SCANNAMES is the same argument.
   *
   * SCANHOME and MSG_FILTER keep canon's default: append-vs-overwrite is a
   * real preference, and message filtering is not a display-space question.
   *
   * @see docs/DECISIONS.md 2026-09-15 — raised by a player
   */
  defaultOn: boolean;
}

export const SET_OPTIONS_CATALOG: readonly SetOptionEntry[] = [
  {
    name: 'scannames',
    defaultOn: true,
    optionsIndex: 0,
    shipStateField: 'scanNames',
  },
  {
    name: 'scanhome',
    defaultOn: false,
    optionsIndex: 1,
    shipStateField: 'scanHome',
  },
  {
    name: 'scanfull',
    defaultOn: true,
    optionsIndex: 2,
    shipStateField: 'scanFull',
  },
  {
    name: 'filter',
    defaultOn: false,
    optionsIndex: 3,
    shipStateField: 'msgFilter',
  },
] as const;

/**
 * The option array as it reads for a player who has never run `set`.
 *
 * ONE source of truth, consumed by both the reader (`applySessionProfile`) and
 * the writer (`SetHandlerService`, which pads absent slots before writing one).
 * The padding matters more than it looks: `set filter on` has to materialise
 * slots 0-2 first, and padding them with 0 would silently switch off two
 * options the player never touched.
 */
export const OPTION_DEFAULTS: readonly number[] = SET_OPTIONS_CATALOG.map((o) =>
  o.defaultOn ? 1 : 0,
);
