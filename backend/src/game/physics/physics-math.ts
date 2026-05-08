/**
 * Pure, side-effect-free physics math.
 *
 * Every function in this module is deterministic: identical inputs always
 * produce identical outputs. The PhysicsTickService is the only caller that
 * mutates ship state; this module just computes the next values.
 *
 * @see GEFUNCS.C — original C source for every formula below
 */

import { ACCENGAMT, COORD_SCALE, WARP_THRESHOLD } from '../constants';

/**
 * One per-tick rotation step. Returns `{ newHeading, snapped }`.
 *
 * Step magnitude is `maxAccel / 10` degrees per tick. When the absolute
 * angular gap to the target is `<= step` *or* `>= 360 - step`, heading
 * snaps to the target. Otherwise heading rotates the short way and the
 * result is normalized to `[0, 360)`.
 *
 * @see GEFUNCS.C:441-460 rotship — `rotamt = max_accel/10.0`, short-way decision
 */
export function rotationStep(
  currentHeading: number,
  targetHeading: number,
  maxAccel: number,
): { newHeading: number; snapped: boolean } {
  const step = maxAccel / 10;
  const cur = normalizeHeading(currentHeading);
  const tgt = normalizeHeading(targetHeading);
  const rawDiff = tgt - cur;
  // Shortest signed gap in (-180, 180]
  const diff = ((rawDiff + 540) % 360) - 180;
  const absDiff = Math.abs(diff);
  if (absDiff <= step || absDiff >= 360 - step) {
    return { newHeading: tgt, snapped: true };
  }
  const dir = diff > 0 ? 1 : -1;
  const next = normalizeHeading(cur + dir * step);
  return { newHeading: next, snapped: false };
}

/** Normalize a heading into the half-open interval `[0, 360)`. */
export function normalizeHeading(heading: number): number {
  const m = heading % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * One per-tick acceleration step. Pure — returns the new speed, the energy
 * debit to apply, and whether this step crossed the warp boundary in either
 * direction.
 *
 * Up: step = `maxAccel`. Down: step = `maxAccel * 2`. Snap when within step.
 * Energy debit: `0` if post-step `speed < WARP_THRESHOLD`; else `ACCENGAMT`.
 *
 * @see GEFUNCS.C:469-573 accel
 */
export function accelerationStep(
  currentSpeed: number,
  targetSpeed: number,
  maxAccel: number,
): { newSpeed: number; energyDebit: number; hyperspaceEvent: 'enter' | 'exit' | null } {
  if (currentSpeed === targetSpeed) {
    return { newSpeed: currentSpeed, energyDebit: 0, hyperspaceEvent: null };
  }

  const goingUp = targetSpeed > currentSpeed;
  const step = goingUp ? maxAccel : maxAccel * 2;
  const gap = Math.abs(targetSpeed - currentSpeed);

  let newSpeed: number;
  if (gap <= step) {
    newSpeed = targetSpeed;
  } else {
    newSpeed = goingUp ? currentSpeed + step : currentSpeed - step;
  }

  // Hyperspace boundary detection — based on the *step*, not the snap.
  // 'enter' = was below threshold, now at-or-above. 'exit' = was at-or-above, now below.
  let hyperspaceEvent: 'enter' | 'exit' | null = null;
  if (currentSpeed < WARP_THRESHOLD && newSpeed >= WARP_THRESHOLD) {
    hyperspaceEvent = 'enter';
  } else if (currentSpeed >= WARP_THRESHOLD && newSpeed < WARP_THRESHOLD) {
    hyperspaceEvent = 'exit';
  }

  // Energy debit: `if (ptr->speed < 1000) usage = 0; else usage = ACCENGAMT;`
  // Per research R-2 the gate uses post-step speed (the step that keeps you
  // at-or-above warp pays the toll; below-warp steps are free).
  const energyDebit = newSpeed < WARP_THRESHOLD ? 0 : ACCENGAMT;

  return { newSpeed, energyDebit, hyperspaceEvent };
}

/**
 * Position integration.
 *   x' = x + speed * sin(deg2rad(heading)) / COORD_SCALE
 *   y' = y - speed * cos(deg2rad(heading)) / COORD_SCALE
 *
 * If `speed === 0` this is a no-op.
 *
 * @see GEFUNCS.C:648-649 moveship
 */
export function positionIntegration(
  x: number,
  y: number,
  heading: number,
  speed: number,
): { x: number; y: number } {
  if (speed === 0) return { x, y };
  const rad = (heading * Math.PI) / 180;
  return {
    x: x + (speed * Math.sin(rad)) / COORD_SCALE,
    y: y - (speed * Math.cos(rad)) / COORD_SCALE,
  };
}

/**
 * Per-debit energy floor gate matching the original `useenergy()` behaviour:
 * the debit is refused if it would leave `energy - amount` below the floor.
 * On refusal, the caller forces `speed2b = 0` so the ship begins decelerating.
 *
 * The "fudge floor" in the original is implicit at the call sites; we model
 * it as a parameter so callers can pin the right floor per debit type.
 *
 * @see GEFUNCS.C useenergy
 */
export function tryEnergyDebit(
  energy: number,
  amount: number,
  floor: number,
): { ok: true; newEnergy: number } | { ok: false } {
  if (amount <= 0) return { ok: true, newEnergy: energy };
  if (energy - amount < floor) return { ok: false };
  return { ok: true, newEnergy: energy - amount };
}

/**
 * Wraps a coordinate into `[0, max)` using modular arithmetic.
 * Applied after position integration when `ship.where <= 1` (in normal space).
 * Guards against NaN and Infinity by returning 0 for non-finite inputs.
 *
 * @see GEFUNCS.C:651-705 moveship — univwrap branch
 */
export function wrapCoord(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % max) + max) % max;
}

/**
 * Derives the integer sector for a coordinate.
 *
 *   sector = { x: floor(x), y: floor(y) }
 *
 * Mirrors `coord1(d) = (int)floor(dcoord)` from `GECMDS.C:3102` — the same
 * convention `scan.handler.ts` already uses. The `+1` display offset in
 * `report.handler.ts` is for the human-readable label; canonical sector is
 * floor of coordinate.
 */
export function sectorOf(coord: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.floor(coord.x), y: Math.floor(coord.y) };
}
