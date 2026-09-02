/**
 * Starting state constants for new ship creation.
 * @see GEMAIN.C:521-522 STRTCASH — starting credits, in THOUSANDS
 * @see GEFUNCS.C:initshp — ship initialisation (class 1 Interceptor, 3 flux pods)
 */

import { START_CASH_CREDITS } from '../constants';

/**
 * Starting credits awarded to every new player.
 *
 * Canon is `numopt(STRTCASH,1,32000) * 1000` with STRTCASH shipped at 100, so
 * 100 000 credits. The port hard-coded 5 000 and its comment read
 * "5 x default x 1000", which is a description of an arithmetic that produces
 * 5 000 only if the default is 1.
 *
 * At 5 000 nothing in the game was purchasable: the cheapest hull is the Heavy
 * Freighter at 40 000 and the Interceptor is 65 000. A free class-1 ship is
 * still granted on signup, so nobody was stranded, but every opening decision
 * -- buy colonists, buy food, save toward a hull -- was closed off.
 */
export const START_CASH = START_CASH_CREDITS;

/** Flux pods placed in items[I_FLUX] (index 4) at ship creation. */
export const START_FLUX_PODS = 3;

/** Ship class assigned on onboarding — class 1 is the Interceptor. */
export const START_CLASS = 1;
