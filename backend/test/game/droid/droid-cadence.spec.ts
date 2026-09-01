/**
 * Every droid carries its own countdown, and it counts seconds.
 *
 * GEMAIN.C:2406-2424 runs the automaton loop every second and calls a droid's
 * `tick_func` only when that droid's own `tick` reaches 0. GEDROIDS.C:216-227
 * then recomputes it:
 *
 *   if (ptr->cantexit == 0) tick = (CYBTICKTIME + gernd()%CYBTICKTIME) * 3;
 *   else                    tick =  CYBTICKTIME + gernd()%CYBTICKTIME;
 *
 * — 18-33 seconds when idle, but 6-11 when battle-locked. Detection also
 * shortens it in place (GEDROIDS.C:278, 335, 442).
 *
 * The port had one global `spawnTickCounter % 30` gate on the 6-second physics
 * tick that ran EVERY droid together once every 180 seconds, and wrote
 * `ShipState.tick` at spawn without ever reading or decrementing it. An engaged
 * droid reacted roughly 3.5x too slowly, and all of them moved in lockstep.
 *
 * @see GEMAIN.C:2406-2424  @see GEDROIDS.C:216-227
 */

import { nextDroidTick } from '../../../src/game/droid/droid-cadence';
import { CYBTICKTIME } from '../../../src/game/constants';
import { Random } from '../../../src/game/combat/random.port';

function fixed(v: number): Random {
  return { next: () => v } as Random;
}

describe('nextDroidTick — GEDROIDS.C:216-227', () => {
  it('is 18-33 seconds when the droid is just cruising', () => {
    for (const r of [0, 0.5, 0.999]) {
      const t = nextDroidTick(0, fixed(r));
      expect(t).toBeGreaterThanOrEqual(CYBTICKTIME * 3);
      expect(t).toBeLessThanOrEqual((CYBTICKTIME * 2 - 1) * 3);
    }
  });

  it('is 6-11 seconds when battle-locked — roughly 3x sharper', () => {
    for (const r of [0, 0.5, 0.999]) {
      const t = nextDroidTick(5, fixed(r));
      expect(t).toBeGreaterThanOrEqual(CYBTICKTIME);
      expect(t).toBeLessThanOrEqual(CYBTICKTIME * 2 - 1);
    }
  });

  it('an engaged droid always reacts sooner than an idle one', () => {
    expect(nextDroidTick(1, fixed(0.9))).toBeLessThan(nextDroidTick(0, fixed(0)));
  });
});
