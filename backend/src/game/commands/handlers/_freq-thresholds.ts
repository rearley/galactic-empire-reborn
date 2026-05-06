/**
 * Channel-frequency scope thresholds preserved verbatim from GECMDS.C:1834-1860 cmd_send.
 * Constitutional balance constants — guarded by a regression test.
 * @see GECMDS.C:1825 cmd_send
 * @see GECMDS.C:1885 cmd_freq
 */

/** Frequency value that maps to hail (all online) scope. @see GECMDS.C:1834 */
export const FREQ_HAIL = 0 as const;

/** Maximum frequency value for sector-scoped messages (inclusive). @see GECMDS.C:1840 */
export const FREQ_SECTOR_MAX = 19999 as const;

/** Minimum frequency value for galaxy-wide messages (inclusive). @see GECMDS.C:1845 */
export const FREQ_GALAXY_MIN = 20000 as const;
