/**
 * Decoys are single-use, and they stack.
 *
 * GEFUNCS.C:1581-1592 (torpedoes) and 1666-1677 (missiles):
 *
 *   for (j=0, dptr=ptr->decout; j<MAXDECOY; ++j)
 *     if (dptr[j] > 0)
 *       if (tptr->distance < 5000 && (gernd()%decodds == 0))
 *         { dptr[j] = 0; tptr->distance = 0; break; }
 *
 * One roll PER LIVE DECOY, and the slot that wins is spent. The port tested
 * `hasActiveDecoy()` — a single boolean — and rolled once, mutating nothing:
 * one decoy bought unlimited intercepts for its whole 15-tick life, and
 * launching a second gave no benefit at all.
 */

import { MAXDECOY, DECODDS } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';
import { tryDecoyIntercept } from '../../../src/game/combat/combat-math';

/** Random that yields a 1-in-DECODDS success only on the listed call indices. */
function randomHittingOn(successes: number[]): Random {
  let i = 0;
  return {
    next: () => {
      const hit = successes.includes(i);
      i += 1;
      // decoyIntercept rolls `floor(next * DECODDS) === 0`.
      return hit ? 0 : 0.999;
    },
  } as Random;
}

describe('tryDecoyIntercept — one roll per live decoy, winner is spent', () => {
  it('returns -1 when no decoy is deployed, without rolling', () => {
    const decout = Array.from({ length: MAXDECOY }, () => 0);
    expect(tryDecoyIntercept(randomHittingOn([0]), decout, DECODDS)).toBe(-1);
  });

  it('spends the winning slot and reports its index', () => {
    const decout = [5, 0, 0];
    const slot = tryDecoyIntercept(randomHittingOn([0]), decout, DECODDS);
    expect(slot).toBe(0);
  });

  it('does not consume a decoy when the roll misses', () => {
    const decout = [5, 0, 0];
    expect(tryDecoyIntercept(randomHittingOn([]), decout, DECODDS)).toBe(-1);
  });

  it('rolls once per live decoy — a second decoy gets a second chance', () => {
    // First slot misses, second hits.
    const decout = [5, 5, 0];
    expect(tryDecoyIntercept(randomHittingOn([1]), decout, DECODDS)).toBe(1);
  });

  it('stops at the first winner, leaving the other decoys intact', () => {
    const decout = [5, 5, 5];
    expect(tryDecoyIntercept(randomHittingOn([0, 1, 2]), decout, DECODDS)).toBe(0);
  });

  it('skips expired slots without spending a roll on them', () => {
    // Only slot 2 is live, so the FIRST roll belongs to it.
    const decout = [0, 0, 5];
    expect(tryDecoyIntercept(randomHittingOn([0]), decout, DECODDS)).toBe(2);
  });
});
