import { resolveGameConfig } from '../config/game-config';

/** Parse a sysop option from the environment, clamped to C's legal range. */
function clampOption(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Constants for the midnight maintenance pass — sourced verbatim from the original C source.
 * The balance-regression test (SC-006) imports each constant and asserts its exact value.
 *
 * @see GEMAIN.C:478  — teambonus = TEAMBONU
 * @see GEMAIN.C:497  — maildays = MAILDAYS_DEFAULT
 * @see GEMAIN.C:593  — pltvcash = PLTVCASH
 * @see GEMAIN.C:596  — pltvdiv  = PLTVDIV
 * @see GEMAIN.C:605  — chgloser = CHGLOSER_DEFAULT
 * @see GEMAIN.H:240  — #define MAXTEAMS 50
 * @see GEMAIN.H:222  — #define MAIL_CLASS_PRODRPT 3
 */

import { MAILDAYS as CANON_MAILDAYS, CHGLOSER as CANON_CHGLOSER } from '../constants';

/**
 * Team bonus added once per member inside the per-user loop.
 *
 * C reads this from the sysop `.cnf`: `teambonus = numopt(TEAMBONU,0,32000)*100L`.
 * The *bounds* (0..32000) and the ×100 scaling are canon; the value is sysop
 * taste. It was previously hard-coded at 3_200_000n — the top of the range —
 * which swamped real scores: a solo team outranked everything at 3.2M while a
 * strong player's own score was five digits, so `tea list` ranked by member
 * count rather than skill. Now sourced from config/game.config.json (default 0).
 *
 * @see GEMAIN.C:478 teambonus = numopt(TEAMBONU,0,32000)*100L
 */
export const TEAMBONU: bigint = BigInt(resolveGameConfig().TEAMBONU) * 100n;

/** Default mail retention in days (env-overridable). @see GEMAIN.C:497 */
// Canon MAILDAYS is 3 (MBMGEMSG.MSG). This held its own 7, so the option table
// and the purge disagreed and the option read `implemented: false`.
export const MAILDAYS_DEFAULT: number = CANON_MAILDAYS;

/**
 * Planet cash-value divisor. Scoring credits `(cash + tax) / (1000000 /
 * PLTVCASH)`, so 1000 means one point per 1000 credits banked.
 *
 * CANON IS 10: `PLTVCASH {The point value of each 1,000,000 : 10}`
 * (GE/REL/MBMGEMSG.MSG:1831), so a planet scores one point per 100,000
 * credits banked. We ran 1,000 — one point per 1,000 — paying ONE HUNDRED
 * TIMES canon for the same balance.
 *
 * The DECISIONS.md entry choosing 1,000 justified it as "the original's
 * shipped values are not in the source — they came from the sysop's option
 * file, which we do not have". That was true on 2026-09-01 and stopped being
 * true on 2026-09-02, when the full distribution was vendored: GE/REL/
 * MBMGEMSG.MSG IS that option file. A deviation justified by "we could not
 * find the canonical value" is exactly the kind the project rules disallow
 * once the value is found.
 *
 * This was pinned to 201,228,378, which is NOT a value — it is the `lngopt`
 * MAX BOUND, the third argument, and the same number is the ceiling for maxpl,
 * weight, value, manhours, phaserprice and shieldprice (GEMAIN.C:557-596).
 * C's own expression proves it: at that magnitude `1000000L / pltvcash`
 * truncates to zero and the divide traps. As a "value" it turned the divisor
 * into a ~201x multiplier, so banked planet cash dominated the leaderboard and
 * combat contributed nothing measurable to `score = plscore + klscore`.
 *
 * Sysop-tunable via PLTVCASH. Must be in 1..1_000_000 for the C expression to
 * remain a divisor.
 *
 * @see GEMAIN.C:593 lngopt(PLTVCASH, 0L, 201228378L)  @see GEMAIN.C:1352
 */
export const PLTVCASH: number = clampOption(process.env['PLTVCASH'], 10, 1, 1_000_000);

/**
 * Planet item-value divisor: `v += value[i] * (qty[i] / PLTVDIV)`.
 *
 * Same ceiling-as-value mistake. At 201,228,378 every stockpile truncated to
 * zero — MAXPL tops out at 1e9, well under the divisor — so inventory was
 * invisible to score and the only rational play was converting everything to
 * cash. 10,000 keeps a million-strong colony worth a few hundred points,
 * comparable to a kill rather than dwarfing or vanishing beside one.
 *
 * @see GEMAIN.C:596 lngopt(PLTVDIV, 0L, 201228378L)  @see GEMAIN.C:1356
 */
export const PLTVDIV: number = clampOption(process.env['PLTVDIV'], 10_000, 1, 1_000_000);

/** Default CHGLOSER percentage (env-overridable, 0–100). @see GEMAIN.C:605 */
// Canon CHGLOSER is 2 percent. 100 was the numopt CEILING — we were taking a
// killed player's ENTIRE bank.
export const CHGLOSER_DEFAULT: number = CANON_CHGLOSER;

/** Maximum number of teams in the team table. @see GEMAIN.H:240 */
export const MAXTEAMS: number = 50;

/** Mail class for planet production reports. @see GEMAIN.H:222 */
export const MAIL_CLASS_PRODRPT: number = 3;

/** Message template type 20 — used for production-report MailStat rows. */
export const MESG20: number = 20;

/**
 * Postgres advisory lock key for the midnight pass — chosen to be non-colliding.
 * ASCII "GMnight\0" = 0x474D6E6967687400.
 *
 * @see specs/009-midnight-job/research.md D2
 */
export const ADVISORY_LOCK_KEY: bigint = 0x474D6E6967687400n;

/**
 * Days before an abandoned signup is deleted.
 *
 * PORT-ORIGINAL: canon has no such sweep — registration was a single BBS-level
 * action with no half-finished state to clean up. Two-step signup creates one:
 * an account with credentials and no username holds its email address forever.
 */
export const ABANDONED_SIGNUP_DAYS = 10;
