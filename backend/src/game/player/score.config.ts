/**
 * Score factor — the fraction of the victim's score transferred to the attacker
 * on a kill.
 *
 *   transfer          = floor((victimScore / 100) * scoreF2)
 *   AI attacker       = floor((victimScore / 100) * scoreF2 / 10)
 *
 * This used to read its own `SCORE_F2` environment variable with a hardcoded
 * default of 100, entirely independent of the sysop option table — which
 * carried the same setting as `SCRFACT`, with canon's default of 35, marked
 * `implemented: false`. Two halves of one option, neither aware of the other:
 * setting `SCRFACT` anywhere did nothing, and the game silently deducted 100
 * where the original deducts 35.
 *
 * It now resolves through the central manifest, so `SCRFACT` is the single
 * name — settable in `config/game.config.json` or the environment, clamped to
 * canon's `numopt` bounds, and reported at boot alongside every other option.
 *
 * DELIBERATE DEVIATION: deployed at 100 against a canon default of 35, which is
 * the value this port has always run. Declared in `config/game.config.json` and
 * `docs/DECISIONS.md` rather than left as an accident of a second code path.
 *
 * @see GEMAIN.C:603 — score_f2 = numopt(SCRFACT,0,32700)
 * @see GE/REL/MBMGEMSG.MSG:472 — SCRFACT {Factor points to deduct from loser: 35}
 */
import { SCRFACT } from '../constants';

export const scoreF2: number = SCRFACT;
