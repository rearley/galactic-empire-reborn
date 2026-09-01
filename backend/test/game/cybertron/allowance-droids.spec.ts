/**
 * Droids have no purse.
 *
 * `CybertronTickService` walks every `status === GESTAT_AUTO` ship, which is
 * Cybertrons AND droids — droids are AI too. But droids are ephemeral
 * (FR-002: no DB row, no User record), so crediting them CYB_ALLOW threw
 * "Record to update not found" on every flush and filled the log:
 *
 *   ERROR [CybertronRepository] allowance credit failed for @Droid-1: ...
 *
 * C never faces this: `cyb_lives` is reached through the class `tick_func`
 * table (GEMAIN.C:2418), so a droid runs `droid_lives` and never the Cybertron
 * allowance line at GECYBS.C:229.
 */

import { creditsAreOwed } from '../../../src/game/cybertron/cyb-decisions';

describe('allowance is for Cybertrons, not droids', () => {
  it('credits a Cybertron', () => {
    expect(creditsAreOwed('Cybrg-207')).toBe(true);
  });

  it('skips an ephemeral droid — it has no User row to credit', () => {
    expect(creditsAreOwed('@Droid-1')).toBe(false);
    expect(creditsAreOwed('@Droid-42')).toBe(false);
  });

  it('skips anything else @-prefixed, which is the AI marker', () => {
    expect(creditsAreOwed('@whatever')).toBe(false);
  });

  it('does not credit a human', () => {
    expect(creditsAreOwed('usr_abc123')).toBe(false);
  });
});
