/**
 * A Cybertron Base Star is a STATION, and canon's own data says so.
 *
 * @see MBMGESHP.MSG `S23ACCL {  Acceleration Rate: 0}`
 * @see MBMGESHP.MSG `S23WARP {  Maximum Warp: 0}`
 *
 * But the pursuit code writes `ptr->speed` DIRECTLY in the hyperwarp band,
 * with no reference to either value:
 *
 * @see GECYBS.C:745 `		ptr->speed2b = (double)low_dist*2000.0;`
 * @see GECYBS.C:746 `		ptr->speed = ptr->speed2b;`
 *
 * so a far-away target sends the base into hyperwarp at twenty times normal
 * speed. Class data contradicted by the code that reads it — the third of the
 * determinable-intent criteria in CLAUDE.md.
 *
 * NOT reachable with the shipped configuration: `S23LATK 20` means the base
 * only attacks USER classes 20 and above, and players fly 1-9, so it never
 * acquires a target and the bands never run. `S23LATK` is a sysop option
 * though, and "unreachable because of a tunable" is not the same as fixed.
 *
 * The fix is NOT a speed clamp. Hyperwarp is deliberately unbounded — canon's
 * own comment calls it "20 X normal speed" — so clamping the band to
 * `topspeed` would break pursuit for every mobile Cybertron. A station simply
 * does not take movement decisions.
 *
 * @see docs/audits/2026-09-15-ge-next-bug-review.md #7
 */
import { describe, it, expect } from 'vitest';
import { isStationaryClass, pickPursuitBand } from '../../../src/game/cybertron/cyb-decisions';

const rand = { next: () => 0.5, intBelow: (n: number) => Math.floor(n / 2) };
const target = { where: 0, speed2b: 0 };

describe('isStationaryClass', () => {
  it('is true only when the class can neither accelerate nor warp', () => {
    expect(isStationaryClass(0, 0)).toBe(true);
    expect(isStationaryClass(200, 15)).toBe(false);
  });

  it('is false when only one of the two is zero', () => {
    // A hull that can accelerate but not warp still moves, and vice versa.
    // Requiring BOTH keeps this to the shape canon actually configures for a
    // base, rather than guessing at partial data.
    expect(isStationaryClass(0, 15)).toBe(false);
    expect(isStationaryClass(200, 0)).toBe(false);
  });
});

describe('a station takes no movement decision', () => {
  const HYPER1 = 20;
  const HYPER2 = 10;

  it('does not enter hyperwarp for a distant target', () => {
    // The reachable half of the bug: distance beyond hyperdist1 is what sets
    // `speed` directly.
    const band = pickPursuitBand(50, HYPER1, HYPER2, 0, 0, rand, target, true);
    expect(band.desiredSpeed).toBe(0);
    expect(band.speed ?? 0).toBe(0);
    expect(band.where).toBeUndefined();
  });

  it('does not creep in the combat band either', () => {
    // The combat band returns a flat 990 with no reference to topSpeed.
    const band = pickPursuitBand(1, HYPER1, HYPER2, 0, 0, rand, target, true);
    expect(band.desiredSpeed).toBe(0);
    expect(band.speed ?? 0).toBe(0);
  });

  it('still raises its shields — a station fights, it just does not move', () => {
    const band = pickPursuitBand(1, HYPER1, HYPER2, 0, 0, rand, target, true);
    expect(band.raiseShields).toBe(true);
  });

  it('leaves a mobile Cybertron alone', () => {
    // The regression that matters: hyperwarp is deliberately unbounded.
    const band = pickPursuitBand(50, HYPER1, HYPER2, 0, 15, rand, target, false);
    expect(band.desiredSpeed).toBeGreaterThan(0);
    expect(band.where).toBe(1);
  });
});
