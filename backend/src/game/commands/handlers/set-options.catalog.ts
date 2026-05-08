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
}

export const SET_OPTIONS_CATALOG: readonly SetOptionEntry[] = [
  {
    name: 'scannames',
    optionsIndex: 0,
    shipStateField: 'scanNames',
  },
  {
    name: 'scanhome',
    optionsIndex: 1,
    shipStateField: 'scanHome',
  },
  {
    name: 'scanfull',
    optionsIndex: 2,
    shipStateField: 'scanFull',
  },
  {
    name: 'filter',
    optionsIndex: 3,
    shipStateField: 'msgFilter',
  },
] as const;
