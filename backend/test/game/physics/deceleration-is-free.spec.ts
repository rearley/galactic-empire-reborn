/**
 * Slowing down is always free, and always possible.
 *
 * In C the only `useenergy` call in `accel()` sits inside the accelerate
 * branch, in the non-snap path:
 *
 *   if (ptr->speed < ptr->speed2b)            // ACCELERATING
 *     if (|speed - speed2b| <= accelrate)
 *       ptr->speed = ptr->speed2b;            //   snap — free
 *     else
 *       { usage = (ptr->speed < 1000) ? 0 : ACCENGAMT;
 *         if (useenergy(...)) ptr->speed += accelrate;
 *         else ptr->speed2b = 0; }
 *   else if (ptr->speed > ptr->speed2b)       // DECELERATING
 *     ptr->speed -= decelrate;                //   unconditional, no debit
 *
 * The port charged ACCENGAMT on ANY speed change whose post-step speed was at
 * or above warp, snap included. Two consequences: a warp trip cost roughly
 * double, and a ship that ran dry at warp could never slow down — the debit was
 * refused, the speed left untouched, and with no passive recharge it coasted
 * forever with no recovery path.
 *
 * Note also that C gates the usage on the PRE-step speed, so the step that
 * carries you across the warp threshold is free and every step already at warp
 * is charged.
 *
 * @see GEFUNCS.C:469-573 accel  @see GEFUNCS.C:1500-1514 useenergy
 */

import { accelerationStep } from '../../../src/game/physics/physics-math';
import { ACCENGAMT } from '../../../src/game/constants';

const WARP_THRESHOLD = 1000;
const maxAccel = 300;

describe('accelerationStep energy debit', () => {
  it('charges ACCENGAMT for a stepped acceleration already at warp', () => {
    const r = accelerationStep(5000, 9000, maxAccel);
    expect(r.newSpeed).toBe(5300);
    expect(r.energyDebit).toBe(ACCENGAMT);
  });

  it('is free below warp', () => {
    const r = accelerationStep(100, 900, maxAccel);
    expect(r.energyDebit).toBe(0);
  });

  it('is free on the step that crosses INTO warp — C gates on the pre-step speed', () => {
    // 900 -> 1200: `if (ptr->speed < 1000) usage = 0` reads 900.
    const r = accelerationStep(900, 5000, maxAccel);
    expect(r.newSpeed).toBeGreaterThanOrEqual(WARP_THRESHOLD);
    expect(r.energyDebit).toBe(0);
  });

  it('is free when the step snaps exactly onto the target', () => {
    // gap 200 <= accelrate 300 -> `ptr->speed = ptr->speed2b`, no useenergy.
    const r = accelerationStep(5000, 5200, maxAccel);
    expect(r.newSpeed).toBe(5200);
    expect(r.energyDebit).toBe(0);
  });

  it('is free when decelerating at warp', () => {
    const r = accelerationStep(9000, 2000, maxAccel);
    expect(r.newSpeed).toBe(9000 - maxAccel * 2);
    expect(r.energyDebit).toBe(0);
  });

  it('is free when decelerating out of warp to a stop', () => {
    const r = accelerationStep(5000, 0, maxAccel);
    expect(r.energyDebit).toBe(0);
  });

  it('is free on a decelerating snap', () => {
    const r = accelerationStep(400, 0, maxAccel);
    expect(r.newSpeed).toBe(0);
    expect(r.energyDebit).toBe(0);
  });
});
