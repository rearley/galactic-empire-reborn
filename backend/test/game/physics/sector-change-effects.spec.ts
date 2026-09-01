/**
 * Crossing a sector boundary calms a ship down.
 *
 * GEFUNCS.C:724-730, inside `moveship`, on the tick a ship enters a new sector:
 *
 *   ptr->hostile = 0;
 *   if (ptr->destruct > 0 && neutral(&newsect))
 *     { prfmsg(SELFD4); ptr->destruct = 0; }
 *
 * Neither happened in the port. `hostile` was set by planet attacks and never
 * cleared by anything, and an armed self-destruct kept counting down after the
 * ship reached the neutral zone — so running for the one safe place in the
 * galaxy did not save you.
 *
 * (`checkdist`, GEFUNCS.C:907-930, also clears `hostile` once you are more than
 * 1000 raw units from the planet you attacked. That is the same flag from the
 * other direction and is handled by the same clear-on-move rule here.)
 */

import { applySectorChangeEffects } from '../../../src/game/physics/sector-change';

describe('applySectorChangeEffects — GEFUNCS.C:724-730', () => {
  it('clears hostile on any sector change', () => {
    const s = { hostile: 15, destruct: 0 };
    applySectorChangeEffects(s, { x: 4, y: 7 });
    expect(s.hostile).toBe(0);
  });

  it('cancels an armed self-destruct on entering the neutral zone', () => {
    const s = { hostile: 0, destruct: 8 };
    const cancelled = applySectorChangeEffects(s, { x: 0, y: 0 });
    expect(s.destruct).toBe(0);
    expect(cancelled).toBe(true);
  });

  it('leaves the countdown running outside the neutral zone', () => {
    const s = { hostile: 0, destruct: 8 };
    const cancelled = applySectorChangeEffects(s, { x: 1, y: 0 });
    expect(s.destruct).toBe(8);
    expect(cancelled).toBe(false);
  });

  it('reports no cancellation when nothing was armed', () => {
    const s = { hostile: 3, destruct: 0 };
    expect(applySectorChangeEffects(s, { x: 0, y: 0 })).toBe(false);
  });
});
