/**
 * T012 — Phaser reload respects phasrtype multiplier (GEFUNCS.C:checkdam).
 *
 * C source: `preload = phasrtype * PRELOAD`
 * The Interceptor bonus (preload *= 2 when shpclass == 2) is commented out
 * in the shipped C source, so we do NOT apply it.
 *
 * Asserts:
 *  - A ship with phasrtype=1 gains exactly PRELOAD per tick.
 *  - A ship with phasrtype=2 gains exactly 2*PRELOAD per tick.
 *  - A ship with phasrtype=3 gains exactly 3*PRELOAD per tick.
 *  - A ship with phasrtype=0 (no phasers) gains nothing.
 *
 * @see GEFUNCS.C:checkdam line 1031 — `preload = (double)(ptr->phasrtype * PRELOAD)`
 */

import { PRELOAD } from '../../src/game/constants';
import { phaserReloadAmount } from '../../src/game/combat/combat-math';

describe('T012 — phaserReloadAmount respects phasrtype multiplier', () => {
  it('phasrtype=0 → reload 0 (no phaser mounted)', () => {
    expect(phaserReloadAmount(0)).toBe(0);
  });

  it('phasrtype=1 → reload PRELOAD', () => {
    expect(phaserReloadAmount(1)).toBe(PRELOAD);
  });

  it('phasrtype=2 → reload 2 * PRELOAD', () => {
    expect(phaserReloadAmount(2)).toBe(2 * PRELOAD);
  });

  it('phasrtype=3 → reload 3 * PRELOAD', () => {
    expect(phaserReloadAmount(3)).toBe(3 * PRELOAD);
  });
});
