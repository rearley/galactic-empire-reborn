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
const val = raw !== undefined ? parseInt(raw, 10) : 100;
if (val < 0 || val > 32700) throw new Error(`SCORE_F2 out of range [0, 32700]: ${val}`);
export const scoreF2 = val;
