/**
 * Compile-time constants for ship management commands (013).
 * Balance constants verified against GEMAIN.H and GEFUNCS.C.
 */

/** @see GEMAIN.H:165 #define COUNTDOWN 20 — initial self-destruct counter */
export const COUNTDOWN = 20 as const;

/** @see GECMDS.C:4499 — maintenance cost at a friendly planet */
export const MAINT_COST_NORMAL = 200 as const;

/** @see GECMDS.C:4504 — maintenance cost at Zygor neutral-zone planet */
export const MAINT_COST_NEUTRAL = 2500 as const;

/** @see GEFUNCS.C:1717 — cloak state after cmd_cloak("on") */
export const CLOAK_RAMP_INIT = 1 as const;
/** @see GEFUNCS.C:1718 — cloak state after one physics tick */
export const CLOAK_RAMP_MID = 2 as const;
/** @see GEFUNCS.C:1719 — fully cloaked state */
export const CLOAK_RAMP_FULL = 10 as const;

/**
 * Sentinel value for ShipState.status when a ship has been abandoned by its captain.
 * Ships with this status are rejected by the command router active-ship gate (FR-803).
 * Using status=3 (beyond GESTAT_AUTO=2) as the abandoned sentinel.
 */
export const SHIP_STATUS_ABANDONED = 3 as const;

/**
 * Score penalty applied on self-destruct.
 * Canonical: GEFUNCS.C:destruct() sets damage=101 which triggers normal kill resolution.
 * When there is no attacker, PlayerScoreService skips penalty. Value is 0 (no extra penalty).
 * @see GEFUNCS.C:1820 destruct() — sets ptr->damage = 101, no direct score deduction
 */
export const DESTRUCT_SCORE_PENALTY = 0 as const;
