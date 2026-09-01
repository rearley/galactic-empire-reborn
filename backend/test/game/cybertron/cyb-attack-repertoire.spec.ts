/**
 * `cyb_attack` is more than phasers and torpedoes.
 *
 * GECYBS.C:490-585, after the weapon volleys:
 *
 *   if (gernd()%10 == 1 && has_zip)            // 1-in-10, class must carry one
 *     if (minesnear)
 *       { if (gernd()%3 == 1) { zip(); minesnear = FALSE; }   // 1-in-3 to sweep
 *         speed2b = d_topspeed; head2b = rndm(359.9);          // flee EITHER way
 *         holdcourse = gernd()%20 + 3; }
 *
 *   if (gernd()%20 == 1)                        // 1-in-20 vector scramble
 *     { speed2b = d_topspeed; head2b = rndm(359.9); holdcourse = gernd()%10 + 3; }
 *
 *   if (where == 1) { for each incoming missile -> speed2b = rndm(5000)+4500;
 *                     holdcourse = gernd()%5 + 5; break; }
 *   else shieldup(ptr,usrn);
 *
 * The port had none of it. Its only evasive behaviour was a zipper branch in
 * the engagement scan that fired on ANY `minesnear`, reversed heading by
 * exactly 180 degrees and returned out of the whole scan — so Cybertrons flew
 * a predictable about-face, never scrambled their approach, never dropped out
 * of hyperspace under missile fire, and never put their shields up.
 *
 * `cyb_lay_decoys` (GECYBS.C:606-612) fills all five empty slots at no
 * inventory cost, and is called only from the attack branch (GECYBS.C:296).
 */

import { decideCybEvasion, layDecoys } from '../../../src/game/cybertron/cyb-decisions';
import { DECOYTIME, MAXDECOY } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';

/** Random returning a scripted sequence, then 0.999 forever. */
function scripted(values: number[]): Random {
  let i = 0;
  return { next: () => (i < values.length ? values[i++] : 0.999) } as Random;
}

/** A value that makes `floor(next * n) === k`. */
const hit = (k: number, n: number) => (k + 0.5) / n;

const TOPSPEED = 8000;

describe('cyb_lay_decoys — GECYBS.C:606-612', () => {
  it('fills every empty slot up to five, at no inventory cost', () => {
    const decout = Array.from({ length: MAXDECOY }, () => 0);
    const filled = layDecoys(decout);
    expect(filled.slice(0, 5)).toEqual([DECOYTIME, DECOYTIME, DECOYTIME, DECOYTIME, DECOYTIME]);
  });

  it('leaves decoys that are still running alone', () => {
    const decout = [4, 0, 7, 0, 0, 0, 0, 0, 0, 0];
    const filled = layDecoys(decout);
    expect(filled[0]).toBe(4);
    expect(filled[2]).toBe(7);
    expect(filled[1]).toBe(DECOYTIME);
  });

  it('never touches slots past the fifth', () => {
    const decout = Array.from({ length: MAXDECOY }, () => 0);
    const filled = layDecoys(decout);
    expect(filled.slice(5).every((t) => t === 0)).toBe(true);
  });
});

describe('decideCybEvasion — GECYBS.C:541-585', () => {
  const base = { hasZipper: true, minesnear: true, where: 0, hasIncomingMissile: false, topSpeed: TOPSPEED };

  it('sweeps mines and flees on the 1-in-10 then 1-in-3 rolls', () => {
    const rand = scripted([hit(1, 10), hit(1, 3), 0.25, 0.5, 0.5]);
    const d = decideCybEvasion({ ...base }, rand);
    expect(d.fireZipper).toBe(true);
    expect(d.clearMinesnear).toBe(true);
    expect(d.speed2b).toBe(TOPSPEED);
    expect(d.holdcourse).toBeGreaterThanOrEqual(3);
  });

  it('flees even when the 1-in-3 sweep roll misses', () => {
    const rand = scripted([hit(1, 10), hit(0, 3), 0.25, 0.5, 0.5]);
    const d = decideCybEvasion({ ...base }, rand);
    expect(d.fireZipper).toBe(false);
    expect(d.speed2b).toBe(TOPSPEED);
    expect(d.head2b).toBeDefined();
  });

  it('does nothing about mines when the class carries no zipper', () => {
    const rand = scripted([hit(1, 10), hit(1, 3), 0.25, 0.9, 0.5]);
    const d = decideCybEvasion({ ...base, hasZipper: false }, rand);
    expect(d.fireZipper).toBe(false);
  });

  it('scrambles its attack vector on a 1-in-20 roll', () => {
    // zipper roll misses, then the 1-in-20 hits
    const rand = scripted([hit(0, 10), hit(1, 20), 0.25, 0.5]);
    const d = decideCybEvasion({ ...base, minesnear: false }, rand);
    expect(d.speed2b).toBe(TOPSPEED);
    expect(d.head2b).toBeDefined();
    expect(d.holdcourse).toBeGreaterThanOrEqual(3);
  });

  it('raises shields when fighting in normal space', () => {
    const rand = scripted([hit(0, 10), hit(0, 20)]);
    const d = decideCybEvasion({ ...base, minesnear: false, where: 0 }, rand);
    expect(d.raiseShields).toBe(true);
  });

  it('does not raise shields in hyperspace — it runs from the missile instead', () => {
    const rand = scripted([hit(0, 10), hit(0, 20), 0.5, 0.5]);
    const d = decideCybEvasion({ ...base, minesnear: false, where: 1, hasIncomingMissile: true }, rand);
    expect(d.raiseShields).toBe(false);
    expect(d.speed2b).toBeGreaterThanOrEqual(4500);
    expect(d.speed2b).toBeLessThan(9500);
    expect(d.holdcourse).toBeGreaterThanOrEqual(5);
  });

  it('does nothing in hyperspace with no missile inbound', () => {
    const rand = scripted([hit(0, 10), hit(0, 20)]);
    const d = decideCybEvasion({ ...base, minesnear: false, where: 1, hasIncomingMissile: false }, rand);
    expect(d.raiseShields).toBe(false);
    expect(d.speed2b).toBeUndefined();
  });
});
