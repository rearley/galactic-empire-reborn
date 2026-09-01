/**
 * `cyb_annoy` is a 1-in-N roll, not something that happens every pass.
 *
 * GECYBS.C:379-401:
 *
 *   void cyb_annoy(ptr, usrn, rnd, first, last) {
 *     if ((gernd()%rnd) == 1) { ...prfmsg(sel, ptr->shipname); }
 *   }
 *
 * and both call sites pass rnd = 20 (GECYBS.C:295, 300). The port dropped the
 * gate entirely and taunted on every call, which — now that the taunt actually
 * reaches the targeted pilot rather than the attacker's sector room — would
 * turn the one piece of early warning in the game into unreadable spam.
 *
 * The two call sites differ only in which message block they draw from:
 * 13-16 when the Cybertron is engaging, 9-12 when it is merely shadowing you.
 */

import { shouldTaunt, CYB_ANNOY_ODDS } from '../../../src/game/cybertron/cyb-decisions';
import { Random } from '../../../src/game/combat/random.port';

const fixed = (v: number) => ({ next: () => v }) as Random;

describe('shouldTaunt — GECYBS.C:391', () => {
  it('uses C\'s 1-in-20 odds', () => {
    expect(CYB_ANNOY_ODDS).toBe(20);
  });

  it('taunts on the winning roll', () => {
    // gernd()%20 == 1 — the second of twenty buckets.
    expect(shouldTaunt(fixed(1.5 / 20), CYB_ANNOY_ODDS)).toBe(true);
  });

  it('stays quiet on every other roll', () => {
    for (const bucket of [0, 2, 5, 10, 19]) {
      expect(shouldTaunt(fixed((bucket + 0.5) / 20), CYB_ANNOY_ODDS)).toBe(false);
    }
  });

  it('speaks up roughly one pass in twenty', () => {
    let hits = 0;
    for (let i = 0; i < 20_000; i++) {
      if (shouldTaunt({ next: () => Math.random() } as Random, CYB_ANNOY_ODDS)) hits++;
    }
    expect(hits / 20_000).toBeGreaterThan(0.03);
    expect(hits / 20_000).toBeLessThan(0.07);
  });
});
