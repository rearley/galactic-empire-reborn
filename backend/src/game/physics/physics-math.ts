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
  const snapped = gap <= step;
  if (snapped) {
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

  // Energy debit. C has exactly ONE useenergy call in accel(), and it sits in
  // the accelerate branch's non-snap path:
  //
  //   if (speed < speed2b)                      ACCELERATING
  //     if (|speed-speed2b| <= accelrate) speed = speed2b;    <- snap, free
  //     else { usage = (speed < 1000) ? 0 : ACCENGAMT; ... }
  //   else if (speed > speed2b) speed -= decelrate;           <- free
  //
  // So: slowing down is always free and always possible (which is what stops a
  // ship that ran dry at warp from coasting forever), the snap step is free,
  // and the gate reads the PRE-step speed — the step that carries you across
  // the warp threshold is free, and every step already at warp is charged.
  //
  // @see GEFUNCS.C:492-497 (the debit) and :534-573 (deceleration)
  const energyDebit = !goingUp || snapped || currentSpeed < WARP_THRESHOLD ? 0 : ACCENGAMT;

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
 *
 * Retained for grid-relative maths (the scan projection). Ship positions use
 * {@link wrapUniverse}, which is centred on the origin as C's universe is.
 */
export function wrapCoord(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % max) + max) % max;
}

/**
 * Wraps a ship coordinate into the universe `[-univmax, +univmax]`.
 *
 * C's universe is a square centred on the origin — the neutral zone is at
 * `NEUTRAL_X = NEUTRAL_Y = 0` (GEMAIN.H:70-71) — and crossing an edge subtracts
 * or adds `univmax*2`:
 *
 * ```
 * if (coord >  univmax) coord -= univmax*2;
 * if (coord < -univmax) coord += univmax*2;
 * ```
 *
 * Applied after position integration when `ship.where <= 1` (in normal space).
 * Non-finite input returns 0.
 *
 * @see GEFUNCS.C:651-705 moveship — univwrap branch
 */
export function wrapUniverse(value: number, univmax: number): number {
  if (!Number.isFinite(value)) return 0;
  const span = univmax * 2;
  if (span <= 0) return 0;
  // Shift only when the coordinate is actually outside, exactly as C does. A
  // modular fold would be equivalent in exact arithmetic but not in floating
  // point: it perturbs in-range values by an ulp, which registers as a wrap and
  // made the boundary-wrapped event fire on both axes for a ship crossing one.
  let wrapped = value;
  while (wrapped > univmax) wrapped -= span;
  while (wrapped < -univmax) wrapped += span;
  return wrapped;
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

/**
 * Compass heading from one point toward another, given the deltas.
 *
 * 0 = north and increases clockwise, which is fixed by `moveShip` above:
 * it advances `y - cos(heading)`, so north is DECREASING y. That makes
 * `atan2(dx, -dy)` the inverse of movement, and it is the convention every
 * bearing in the port uses — scans, nav, the engine-course helper, droid
 * targeting and the Cybertron's own firing solution.
 *
 * Two Cybertron pursuit sites used `atan2(dx, dy)` instead, a Y-axis flip, so
 * the AI aimed correctly and then drove away from anything north of it.
 * Sharing one helper is what stops the two drifting again.
 */
export function headingToward(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}
