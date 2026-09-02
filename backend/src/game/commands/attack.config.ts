/**
 * DI tokens and factories for the six planet-attack combat coefficients.
 *
 * PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3 are sysop-tunable options
 * loaded via numopt(PLATTRx, 5, 1000) / 100.0 in GEMAIN.C:532–548.
 * FIRETICKS is a compile-time constant in GEMAIN.H:138.
 *
 * All six are exposed as DI tokens following the CLOAK_ENERGY_USE pattern from
 * feature 013 so balance-regression tests can override them.
 *
 * Defaults come from GAME_CONFIG via constants.ts, which resolves them from
 * the canon values in MBMGEMSG.MSG. They are NOT restated here: this loader
 * carried its own copies at 0.05 -- the numopt FLOOR of 5/100 -- for all five,
 * so the option table and the code that consumed it disagreed completely.
 *
 * Env vars: PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS
 * @see GEMAIN.C:532–548 — numopt calls for PLATTR*
 * @see GEMAIN.H:138 — FIRETICKS
 */

import {
  PLATTRF1 as CANON_PLATTRF1,
  PLATTRF2 as CANON_PLATTRF2,
  PLATTRF3 as CANON_PLATTRF3,
  PLATTRT1 as CANON_PLATTRT1,
  PLATTRT2 as CANON_PLATTRT2,
} from '../constants';

export const PLATTRT1 = 'PLATTRT1' as const;
export const PLATTRT2 = 'PLATTRT2' as const;
export const PLATTRF1 = 'PLATTRF1' as const;
export const PLATTRF2 = 'PLATTRF2' as const;
export const PLATTRF3 = 'PLATTRF3' as const;
export const FIRETICKS = 'FIRETICKS' as const;

export const PLATTRT1_DEFAULT = CANON_PLATTRT1;
export const PLATTRT2_DEFAULT = CANON_PLATTRT2;
export const PLATTRF1_DEFAULT = CANON_PLATTRF1;
export const PLATTRF2_DEFAULT = CANON_PLATTRF2;
export const PLATTRF3_DEFAULT = CANON_PLATTRF3;
export const FIRETICKS_DEFAULT = 10 as const;

function loadFloat(env: NodeJS.ProcessEnv, key: string, defaultVal: number): number {
  const v = env[key];
  if (!v) return defaultVal;
  const n = parseFloat(v);
  if (isNaN(n)) return defaultVal;
  return n;
}

function loadInt(env: NodeJS.ProcessEnv, key: string, defaultVal: number): number {
  const v = env[key];
  if (!v) return defaultVal;
  const n = parseInt(v, 10);
  if (isNaN(n)) return defaultVal;
  return n;
}

export function loadPlattrt1(env: NodeJS.ProcessEnv = process.env): number {
  return loadFloat(env, 'PLATTRT1', PLATTRT1_DEFAULT);
}
export function loadPlattrt2(env: NodeJS.ProcessEnv = process.env): number {
  return loadFloat(env, 'PLATTRT2', PLATTRT2_DEFAULT);
}
export function loadPlattrf1(env: NodeJS.ProcessEnv = process.env): number {
  return loadFloat(env, 'PLATTRF1', PLATTRF1_DEFAULT);
}
export function loadPlattrf2(env: NodeJS.ProcessEnv = process.env): number {
  return loadFloat(env, 'PLATTRF2', PLATTRF2_DEFAULT);
}
export function loadPlattrf3(env: NodeJS.ProcessEnv = process.env): number {
  return loadFloat(env, 'PLATTRF3', PLATTRF3_DEFAULT);
}
export function loadFireticks(env: NodeJS.ProcessEnv = process.env): number {
  return loadInt(env, 'FIRETICKS', FIRETICKS_DEFAULT);
}
