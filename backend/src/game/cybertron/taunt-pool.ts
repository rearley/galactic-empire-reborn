import type { Random } from '../combat/random.port';

/**
 * Predefined pool of hostile Cybertron taunt messages.
 * Used by cyb_annoy when engagement conditions are met but no weapon is fired.
 *
 * @see GECYBS.C:379 cyb_annoy — original message dispatch via prfmsg(sel,...)
 * @see specs/007-cybertron-ai/plan.md R-10 (taunt event delivery)
 */
export const TAUNT_MESSAGES: readonly string[] = [
  'Your shields are pathetic. Prepare to be dismantled.',
  'I have logged your location. Resistance is illogical.',
  'You cannot outrun a Cybertron. I will find you.',
  'Your weapons are toys. Mine are not.',
  'Surrender your gold now, or I will take it from your wreckage.',
  'I have destroyed 1,000 ships. You will be 1,001.',
  'You are a long way from the neutral zone, little ship.',
  'The last pilot who fled me is still running.',
  'My targeting systems are locked on your life support.',
  'You have been selected for termination. Have a nice day.',
  'Your crew shows elevated fear responses. How delightful.',
  'I have already calculated the outcome. You lose.',
  'Enjoy your last coordinates. I have memorized them.',
];

/**
 * Picks a taunt message from the pool using the injected Random port.
 * @see GECYBS.C:379 cyb_annoy — base+gernd()%(last-first+1) selection
 */
export function pickTaunt(rand: Random): string {
  const idx = Math.floor(rand.next() * TAUNT_MESSAGES.length);
  return TAUNT_MESSAGES[idx];
}
