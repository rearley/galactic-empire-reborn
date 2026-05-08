/**
 * Starting state constants for new ship creation.
 * @see GEMAIN.C:521 STRTCASH — starting credits (5 × default × 1000)
 * @see GEFUNCS.C:initshp — ship initialisation (class 1 Interceptor, 3 flux pods)
 */

/** Starting credits awarded to every new player. */
export const START_CASH = 5000n;

/** Flux pods placed in items[I_FLUX] (index 4) at ship creation. */
export const START_FLUX_PODS = 3;

/** Ship class assigned on onboarding — class 1 is the Interceptor. */
export const START_CLASS = 1;
