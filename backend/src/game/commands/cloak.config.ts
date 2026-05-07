/**
 * DI token and factory for CLOAK_ENERGY_USE — the energy cost per cloak activation
 * and per-physics-tick maintenance drain.
 *
 * CLENGUSE is NOT a GEMAIN.H compile-time constant. It is declared in GEGLOBAL.H:150
 * and loaded via `numopt(CLENGUSE,1,32000)` at GEMAIN.C:519 as a sysop-tunable
 * runtime option. We expose it as an injected value following the midnight.config.ts
 * pattern.
 *
 * Env var: CLOAK_ENERGY_USE (integer 1–32000, default 50)
 * @see GEGLOBAL.H:150 CLENGUSE declaration
 * @see GEMAIN.C:519 numopt(CLENGUSE,1,32000)
 * @see GEFUNCS.C:1374, :1384 — where CLENGUSE is consumed in cloakstat()
 */

export const CLOAK_ENERGY_USE = 'CLOAK_ENERGY_USE' as const;

export const CLOAK_ENERGY_USE_DEFAULT = 50 as const;
export const CLOAK_ENERGY_USE_MIN = 1 as const;
export const CLOAK_ENERGY_USE_MAX = 32000 as const;

export function loadCloakEnergyUse(env: NodeJS.ProcessEnv = process.env): number {
  const v = env['CLOAK_ENERGY_USE'];
  if (!v) return CLOAK_ENERGY_USE_DEFAULT;
  const n = parseInt(v, 10);
  if (isNaN(n)) return CLOAK_ENERGY_USE_DEFAULT;
  return Math.min(CLOAK_ENERGY_USE_MAX, Math.max(CLOAK_ENERGY_USE_MIN, n));
}
