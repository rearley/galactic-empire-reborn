/**
 * Input validators derived from the original game's helper functions.
 * @see GEFUNCS.C:1933 valdegree — validates rotation degrees in [-180, 180]
 * @see GEFUNCS.C:1906 valpcnt  — validates percentage in [min, max] (default 0..99)
 */

export type ValidatorOk<T> = { ok: true; value: T };
export type ValidatorErr = { ok: false; code: 'NUMOOR' | 'INVALID' };
export type ValidatorResult<T> = ValidatorOk<T> | ValidatorErr;

/**
 * Validates a rotation degree argument.
 * Accepts integers in [-180, 180] inclusive.
 * @see GEFUNCS.C:1933 valdegree
 */
export function valdegree(input: string): ValidatorResult<number> {
  const trimmed = input.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) {
    return { ok: false, code: 'INVALID' };
  }
  const n = parseInt(trimmed, 10);
  if (n < -180 || n > 180) {
    return { ok: false, code: 'NUMOOR' };
  }
  return { ok: true, value: n };
}

/**
 * Validates a percentage argument.
 * Accepts integers in [min, max] inclusive; defaults: 0..99.
 * @see GEFUNCS.C:1906 valpcnt
 */
export function valpcnt(
  input: string,
  min = 0,
  max = 99,
): ValidatorResult<number> {
  const trimmed = input.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) {
    return { ok: false, code: 'INVALID' };
  }
  const n = parseInt(trimmed, 10);
  if (n < min || n > max) {
    return { ok: false, code: 'NUMOOR' };
  }
  return { ok: true, value: n };
}
