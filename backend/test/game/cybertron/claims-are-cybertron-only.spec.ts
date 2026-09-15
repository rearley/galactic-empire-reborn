/**
 * A droid cannot claim a player.
 *
 * `cybmine` is the channel a CYBERTRON has claimed, and `notclaimed()` counts
 * how many already hold a claim on a candidate so a class's `noClaim` gang-up
 * limit can be enforced. Canon counts every `GESTAT_AUTO` ship:
 *
 * @see GECYBS.C:368 `	if (wptr->status == GESTAT_AUTO && wptr->cybmine == (byte)usrn)`
 *
 * Droids are `GESTAT_AUTO` too, and `cybmine` appears nowhere in `GEDROIDS.C` —
 * a droid holding one is meaningless data being counted. Canon reaches the bug
 * through droids inheriting `cybmine = 0` from the new-ship template; this port
 * reaches the same counter by a different road:
 *
 *   @see GECMDS.C:980 `			if (wptr->status == GESTAT_AUTO)`
 *
 * which the phaser handler follows faithfully, writing the firer's channel onto
 * ANY auto victim. So shooting a droid registered a Cybertron claim on the
 * shooter, and with `noClaim` 1 for an Interceptor a single shot could lock
 * every Cybertron out of pursuing that player.
 *
 * Determinable intent: the counter asks how many CYBERTRONS have claimed this
 * player. @see docs/audits/2026-09-15-ge-next-bug-review.md B-01
 */
import { describe, it, expect } from 'vitest';
import { countCybertronClaims } from '../../../src/game/cybertron/cyb-decisions';

const GESTAT_AUTO = 2;
const CYB = 21;
const DROID = 33;
const isCyb = (shpclass: number) => shpclass === CYB;

const ship = (over: Partial<{ status: number; cybmine: number; shpclass: number }>) => ({
  status: GESTAT_AUTO, cybmine: 255, shpclass: CYB, ...over,
});

describe('counting claims on a player', () => {
  it('counts a Cybertron that has claimed them', () => {
    expect(countCybertronClaims([ship({ cybmine: 7 })], 7, isCyb)).toBe(1);
  });

  it('does NOT count a droid that has claimed them', () => {
    // B-01. The droid got that value from being shot at, not from hunting.
    expect(countCybertronClaims([ship({ cybmine: 7, shpclass: DROID })], 7, isCyb)).toBe(0);
  });

  it('does not count a Cybertron hunting somebody else', () => {
    expect(countCybertronClaims([ship({ cybmine: 9 })], 7, isCyb)).toBe(0);
  });

  it('does not count a live player ship', () => {
    // A player is not AI, whatever happens to be in the field.
    expect(countCybertronClaims([ship({ status: 1, cybmine: 7 })], 7, isCyb)).toBe(0);
  });

  it('counts several Cybertrons but ignores droids among them', () => {
    const fleet = [
      ship({ cybmine: 7 }),
      ship({ cybmine: 7, shpclass: DROID }),
      ship({ cybmine: 7 }),
      ship({ cybmine: 255 }),
    ];
    expect(countCybertronClaims(fleet, 7, isCyb)).toBe(2);
  });
});
