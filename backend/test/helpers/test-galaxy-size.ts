/**
 * Shrink the galaxy for the test run.
 *
 * Runs before the module registry is populated, so `GAME_CONFIG.UNIVMAX` picks
 * this up through the loader's normal default -> file -> env -> clamp chain
 * (game-config.ts:158-165). Only the world SIZE changes; every generation rule,
 * density and coordinate invariant is size-independent and still exercised.
 *
 * Deliberately NOT the deployed value: a test that silently ran the production
 * galaxy would take minutes per suite, and the properties that actually depend
 * on deployed size assert against config/game.config.json instead.
 */
process.env.UNIVMAX ??= '20';
