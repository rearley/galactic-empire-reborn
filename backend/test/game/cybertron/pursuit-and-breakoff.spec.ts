/**
 * Cybertron pursuit and disengagement.
 *
 * Three separate transcription inversions, all in GECYBS.C.
 *
 * 1. SHIELDS (GECYBS.C:783-784, 802-803, and cyb_attack at :580-584)
 *    `if (ptr->where == 0) shieldup(ptr,usrn);` — a Cybertron closing in
 *    NORMAL space puts its shields up. The port had `currentWhere === 1`,
 *    i.e. only on the single tick it dropped out of hyperwarp, so Cybertrons
 *    fought their entire engagement bare-hulled.
 *
 * 2. BREAK-OFF (GECYBS.C:255)
 *    `if (isquad(ptr) && gernd()%CYB_BREAKOFF == 0)` — and `isquad` is
 *    `tough_factor == CYB_TOUGH_1` (GECYBS.C:834-838). It is the CYBERQUADS
 *    that take a breather. The port had `tough !== CYB_TOUGH_1`, the exact
 *    inverse: heavy classes pursued relentlessly while light Scouts and Drones
 *    randomly disengaged. C also falls through and still evaluates fire; the
 *    port returned out of the whole engagement scan.
 *
 * 3. SPEED (GECYBS.C:745-746, 760-761, 774-775, 789-790)
 *    Each band assigns or clamps `ptr->speed` instantly as well as setting
 *    `speed2b`. The port set only `speed2b`, so a Cybertron drifted toward its
 *    new speed instead of snapping to it — it never actually braked.
 */

import { pickPursuitBand } from '../../../src/game/cybertron/cyb-decisions';
import { Random } from '../../../src/game/combat/random.port';

function fixedRandom(v = 0.5): Random {
  return { next: () => v } as Random;
}

const HYPER1 = 20;
const HYPER2 = 10;
const TOPSPEED = 8000;
const MAXSHLD = 3;

describe('pickPursuitBand — shields go UP in normal space', () => {
  it('raises shields in the close band when already in normal space', () => {
    const band = pickPursuitBand(5, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.raiseShields).toBe(true);
  });

  it('raises shields in the combat band when already in normal space', () => {
    const band = pickPursuitBand(2, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.raiseShields).toBe(true);
  });

  it('does not raise shields on the hyperwarp band — C drops them there', () => {
    const band = pickPursuitBand(30, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.raiseShields).toBe(false);
    expect(band.where).toBe(1);
  });

  it('does not raise shields in the brake band — C has no shieldup there', () => {
    const band = pickPursuitBand(15, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.raiseShields).toBe(false);
  });

  it('does not raise shields while still in hyperspace', () => {
    const band = pickPursuitBand(5, HYPER1, HYPER2, 1, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.raiseShields).toBe(false);
  });
});

describe('pickPursuitBand — the instantaneous speed assignment/clamps', () => {
  it('hyperwarp band snaps speed straight to speed2b', () => {
    const band = pickPursuitBand(30, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.speed).toBe(band.desiredSpeed);
  });

  it('brake band clamps speed to 20000', () => {
    const band = pickPursuitBand(15, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.speedClamp).toBe(20000);
  });

  it('close band clamps speed to the class top speed', () => {
    const band = pickPursuitBand(5, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.speedClamp).toBe(TOPSPEED);
  });

  it('combat band clamps speed to the class top speed', () => {
    const band = pickPursuitBand(2, HYPER1, HYPER2, 0, MAXSHLD, TOPSPEED, fixedRandom(), { where: 0, speed2b: 0 });
    expect(band.speedClamp).toBe(TOPSPEED);
  });
});
