/**
 * TEAMMAX is enforced when joining a team.
 *
 *   if (teamtab[i].teamcount >= team_max) { prfmsg(TEAMBIG); return; }
 *                                                       GECMDS.C:5357
 *
 * The option was declared at 32000 -- the clamp ceiling -- and checked nowhere,
 * so teams were unbounded. That is a live scoreboard exploit rather than a
 * cosmetic gap: the midnight job adds TEAMBONU per member and divides team
 * score by teamcount (midnight.repository.ts), so an uncapped team farms the
 * per-member term without limit. Capping team size is the defect 3.2c patched.
 *
 * The count is taken live from the user table, not from Team.teamcount, which
 * the midnight job only recomputes once a day -- reading that column would let
 * a team overfill freely within a single day.
 */

import { TEAMMAX } from '../../src/game/constants';

describe('TEAMMAX', () => {
  it('is canon 10, not the clamp ceiling', () => {
    expect(TEAMMAX).toBe(10);
  });

  it('is small enough to bound the per-member midnight bonus', () => {
    // The property that matters: a team must not be able to grow without limit.
    expect(TEAMMAX).toBeGreaterThan(1);
    expect(TEAMMAX).toBeLessThan(100);
  });
});
