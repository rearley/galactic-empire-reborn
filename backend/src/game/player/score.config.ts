/**
 * Score factor F2 — controls what fraction of the victim's score is transferred
 * to the attacker on a kill. Loaded once at module import time from the
 * SCORE_F2 environment variable; throws immediately if out of range.
 *
 * Formula: transfer = floor((victimScore / 100) * scoreF2)
 * AI attacker branch: floor((victimScore / 100) * scoreF2 / 10)
 *
 * @see GEMAIN.C:603  numopt(SCRFACT, 0, 32700)
 */
const raw = process.env['SCORE_F2'];
// parseInt is deliberately NOT used: it returns NaN for 'abc' — and NaN fails
// BOTH range comparisons, so the guard below would pass it through and leave
// scoreF2 = NaN, poisoning every kill's score arithmetic silently. It also
// truncates '12abc' to 12, turning an operator's typo into a live wrong value.
// Number() rejects both.
// An empty or whitespace-only value is "not configured", not a request for
// zero scoring — Number('') is 0, which would silently switch kill scoring off.
const trimmed = raw?.trim();
const val = trimmed ? Number(trimmed) : 100;
if (!Number.isInteger(val)) throw new Error(`SCORE_F2 must be an integer: ${raw}`);
if (val < 0 || val > 32700) throw new Error(`SCORE_F2 out of range [0, 32700]: ${val}`);
export const scoreF2 = val;
