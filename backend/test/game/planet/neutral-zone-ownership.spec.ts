import { S00, S00_PLNUM } from '../../../src/game/galaxy/s00';
import { NEUTRAL_ZONE_OWNER } from '../../../src/game/combat/neutral-zone';

/**
 * C creates the neutral-zone trading posts ALREADY OWNED — `build_plan_1` and
 * `build_plan_2` copy `s00[idx].owner` into `planet.userid` (GEPLANET.C:671,
 * 737). Every rule that keys on ownership then protects them for free.
 *
 * This port left them unowned, and `trans_up` is faithful to C's rule — "you
 * must own this planet or NOBODY must own it to xfer up" (GECMDS.C:3374) — so
 * the correct rule applied to the wrong data let ANY pilot orbit Nexus Prime
 * and haul away its stock, which the midnight job restocks to 1,032,000 of
 * everything. Free cargo, sold at Zygor, for ever. Found by orbiting the wrong
 * planet by accident during a playtest and being handed 460 food cases.
 */
describe('neutral-zone planets are owned, as in C', () => {
  it('every hub planet carries the system owner', () => {
    expect(S00).toHaveLength(S00_PLNUM);
    for (const entry of S00) {
      expect(entry.owner).toBe(NEUTRAL_ZONE_OWNER);
    }
  });

  it('the system owner cannot collide with a player id', () => {
    // Player ids are generated as `usr_<hex>`; the ** convention is C's own for
    // system-held records ("**Free**" marks an abandoned planet).
    expect(NEUTRAL_ZONE_OWNER).toMatch(/^\*\*.+\*\*$/);
    expect(NEUTRAL_ZONE_OWNER).not.toMatch(/^usr_/);
  });
});
