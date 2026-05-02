/**
 * Input validators derived from the original game's helper functions.
 * @see GEFUNCS.C:1933 valdegree — validates rotation degrees in [-180, 180]
 * @see GEFUNCS.C:1906 valpcnt  — validates percentage in [min, max] (default 0..99)
 */

import { ITEM_NAMES } from '../constants/items';

/** Short keyword aliases matching genearas() in the original game. */
const ITEM_SHORT_KEYWORDS = [
  'men', 'mis', 'tor', 'ion', 'fla', 'foo', 'fig', 'dec', 'tro', 'zip', 'jam', 'min', 'gol', 'spy',
];

/**
 * Resolve an item keyword (short alias or case-insensitive prefix of full name) to its 0-based index.
 * Returns -1 if not found.
 * @see GECMDS.C:genearas
 */
export function resolveItemKeyword(keyword: string): number {
  const lower = keyword.toLowerCase();
  // Try short keyword exact match first
  const shortIdx = ITEM_SHORT_KEYWORDS.indexOf(lower);
  if (shortIdx !== -1) return shortIdx;
  // Try case-insensitive prefix match against full names
  for (let i = 0; i < ITEM_NAMES.length; i++) {
    if (ITEM_NAMES[i].toLowerCase().startsWith(lower)) return i;
  }
  return -1;
}

/**
 * Parses an unsigned 32-bit integer from a string. Returns undefined on failure.
 */
export function parseUint32(input: string): number | undefined {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = parseInt(trimmed, 10);
  if (n < 0 || n > 0xffff_ffff) return undefined;
  return n;
}

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
