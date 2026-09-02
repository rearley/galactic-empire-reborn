/**
 * The two halves of a kill's score movement. They are NOT the same number.
 *
 * GEFUNCS.C:1155-1184:
 *
 *   amt     = scr + bonus;
 *   ded_amt = (amt/100L)*score_f2;
 *   if (who < 0 || who >= nterms) ded_amt = ded_amt/10;   // killed by a Cybertron
 *   ... victim loses ded_amt ...
 *   (wuptr->score)   += amt;                              // attacker gets amt
 *   (wuptr->klscore) += amt;
 *
 * Only the deduction is scaled by `score_f2`, and only the deduction is
 * divided by ten for an AI kill — dying to a Cybertron is meant to sting less
 * than dying to a player, while the Cybertron still books the full amount.
 *
 * The port computed one `transfer` and used it for both sides. Latent at the
 * shipped default (score_f2 = 100 makes ded_amt == amt), which is why it went
 * unnoticed; turn the knob down and the attacker's award silently shrinks with
 * the victim's loss.
 */

/**
 * Bonus added to a kill, inversely proportional to the VICTIM's roster rank.
 *
 *   if (waruptr->rospos > 0) bonus = (long)(score_bonus/(waruptr->rospos));
 *                                                      GEFUNCS.C:1150-1153
 *
 * `killem(ptr,usrn)` is called with the victim, so `waruptr` is the victim's
 * user record: the higher the ship you killed was ranked, the bigger the prize.
 * rospos 0 means unranked (GEMAIN.C:1302-1332 assigns it only to qualifiers),
 * and pays nothing. C's long division truncates.
 */
export function killScoreBonus(victimRospos: number, scoreBonus: number): number {
  if (victimRospos <= 0) return 0;
  return Math.max(0, Math.trunc(scoreBonus / victimRospos));
}

/** What the killer books. Unscaled — `amt = scr + bonus`. */
export function killScoreAward(amt: number): number {
  return Math.max(0, Math.trunc(amt));
}

/**
 * What the victim loses: `(amt/100)*score_f2`, then `/10` if an AI made the
 * kill. C's `long` arithmetic truncates at every step, so `amt/100` truncates
 * BEFORE the multiply — 199 points at score_f2 100 costs 100, not 199.
 */
export function killScoreDeduction(amt: number, scoreF2: number, killedByAi: boolean): number {
  let ded = Math.trunc(Math.trunc(amt / 100) * scoreF2);
  if (killedByAi) ded = Math.trunc(ded / 10);
  return Math.max(0, ded);
}
