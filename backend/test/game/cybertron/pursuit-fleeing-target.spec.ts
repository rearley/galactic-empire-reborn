/**
 * A Cybertron in the combat band must MATCH a target that runs for hyperspace.
 *
 * Canon's combat band branches on where the TARGET is (GECYBS.C:793-796):
 *
 *   if (wptr->where == 1)
 *       ptr->speed2b = ((wptr->speed2b > d_topspeed) ? d_topspeed : (wptr->speed2b*1.25));
 *   else
 *       ptr->speed2b = ((low_dist > .5) ? 990.0 : rndm(500.0));
 *
 * The port implemented only the `else`, so a pursuing Cybertron crawled at a
 * flat 990 no matter what the target did. A player at warp is `where == 1` and
 * moving thousands of units a tick, so fleeing was a guaranteed escape — three
 * round-6 pilots independently found they could not be caught, and one measured
 * the range OPENING by 2,189 units across two chases.
 *
 * The 1.25 is the whole point: the pursuer goes a quarter faster than its prey,
 * bounded by its own top speed. That bound is what keeps a slow hull honest —
 * it closes on a fleeing Interceptor only if it is actually fast enough.
 *
 * The stationary case stays 990 and IS canon: an observer parked in normal
 * space measured 0.149 sectors/min of approach, which is exactly this branch.
 *
 * @see GECYBS.C:786-803
 */
import { pickPursuitBand } from '../../../src/game/cybertron/cyb-decisions';
import { Random } from '../../../src/game/combat/random.port';

const rand: Random = { next: () => 0 };
const band = (dist: number, target: { where: number; speed2b: number }, topSpeed = 20000) =>
  pickPursuitBand(dist, 25, 10, 0, topSpeed, rand, target);

describe('combat-band pursuit of a target that runs', () => {
  it('matches a fleeing target at 1.25x its speed, not a flat 990', () => {
    const b = band(2.0, { where: 1, speed2b: 8000 });
    expect(b.desiredSpeed).toBe(10000);
  });

  it('never exceeds its own top speed, however fast the prey is', () => {
    const b = band(2.0, { where: 1, speed2b: 900000 });
    expect(b.desiredSpeed).toBe(20000);
  });

  it('a slow hull still cannot catch a fast runner — the cap is the balance', () => {
    // Base Star: topspeed 0. It may want the target; it does not get to teleport.
    const b = band(2.0, { where: 1, speed2b: 50000 }, 0);
    expect(b.desiredSpeed).toBe(0);
  });

  it('still crawls at 990 against a target in normal space', () => {
    expect(band(2.0, { where: 0, speed2b: 0 }).desiredSpeed).toBe(990);
  });

  it('closes to a random sub-500 drift inside half a sector', () => {
    expect(band(0.25, { where: 0, speed2b: 0 }).desiredSpeed).toBe(0);
  });

  it('leaves the outer bands alone', () => {
    // A fleeing target does not change the hyperwarp or brake bands.
    expect(band(30, { where: 1, speed2b: 8000 }).desiredSpeed).toBe(60000);
    expect(band(15, { where: 1, speed2b: 8000 }).desiredSpeed).toBe(20000);
  });
});
