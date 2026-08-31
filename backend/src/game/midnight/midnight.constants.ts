import { resolveGameConfig } from '../config/game-config';

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
export const MAILDAYS_DEFAULT: number = 7;

/** Planet cash-value divisor. @see GEMAIN.C:593 */
export const PLTVCASH: number = 201_228_378;

/** Planet item-value divisor. @see GEMAIN.C:596 */
export const PLTVDIV: number = 201_228_378;

/** Default CHGLOSER percentage (env-overridable, 0–100). @see GEMAIN.C:605 */
export const CHGLOSER_DEFAULT: number = 100;

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
