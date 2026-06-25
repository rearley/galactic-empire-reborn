/**
 * Per-class tunable config for Cybertron/Sartern AI ships.
 * Values sourced verbatim from reference/ge-source/GECYBS.C class table.
 * Override via env: CYBERTRON_CLASS_<N>_TOT_TO_CREATE, _TOOCLOSE, _HYPERDIST1, _HYPERDIST2, _CYB_GOLD.
 *
 * @see GECYBS.C class table — tot_to_create, tooclose, hyperdist1, hyperdist2, cyb_gold
 * @see specs/007-cybertron-ai/plan.md R-6 (config split rationale)
 */
export interface CybertronClassConfig {
  /** How many of this class should exist at steady state. @see GECYBS.C tot_to_create */
  tot_to_create: number;
  /** Distance threshold below which normal-space combat / tooclose test applies. @see GECYBS.C tooclose */
  tooclose: number;
  /** Hyperwarp engagement distance (sectors) — above this, Cybertron warps. @see GECYBS.C hyperdist1 */
  hyperdist1: number;
  /** Brake-band distance (sectors) — between hyperdist1 and hyperdist2, Cybertron brakes. @see GECYBS.C hyperdist2 */
  hyperdist2: number;
  /** Upper bound for initial I_GOLD inventory (rnd % cyb_gold). @see GECYBS.C cyb_gold */
  cyb_gold: number;
}

/**
 * Default per-class configs sourced verbatim from GECYBS.C class table.
 * Class keys: 21=Cybertron Scout, 22=Cyberquad, 23=Base Star, 24=Sartern Attack Drone, 25=Sartern Obliterator.
 * Hyperwarp distances from reference/wiki/cpu-ships.md: hyperdist1=25, hyperdist2=10 for all classes.
 * tot_to_create corresponds to the "Make" column in the wiki table.
 *
 * @see GECYBS.C — global tooclose, hyperdist1, hyperdist2, cyb_gold read from config at boot
 * @see reference/wiki/cpu-ships.md — Make column = tot_to_create; hyperwarp >25 / brake <10
 */
export const CYBERTRON_CLASS_DEFAULTS: Record<number, CybertronClassConfig> = {
  21: { tot_to_create: 10, tooclose: 3000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 50_000 },
  22: { tot_to_create: 5, tooclose: 3000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 100_000 },
  23: { tot_to_create: 1, tooclose: 3000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 200_000 },
  24: { tot_to_create: 6, tooclose: 3000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 10_000 },
  25: { tot_to_create: 2, tooclose: 3000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 500_000 },
};

/**
 * Build the resolved config for all AI classes, merging env overrides with defaults.
 * Env pattern: CYBERTRON_CLASS_21_TOT_TO_CREATE=8, CYBERTRON_CLASS_24_HYPERDIST1=30, etc.
 * Called once at module initialization.
 */
export function buildCybertronClassConfigs(): Record<number, CybertronClassConfig> {
  const config: Record<number, CybertronClassConfig> = {};
  for (const [classNumStr, defaults] of Object.entries(CYBERTRON_CLASS_DEFAULTS)) {
    const n = Number(classNumStr);
    const prefix = `CYBERTRON_CLASS_${n}_`;
    config[n] = {
      tot_to_create: envInt(`${prefix}TOT_TO_CREATE`, defaults.tot_to_create),
      tooclose: envInt(`${prefix}TOOCLOSE`, defaults.tooclose),
      hyperdist1: envFloat(`${prefix}HYPERDIST1`, defaults.hyperdist1),
      hyperdist2: envFloat(`${prefix}HYPERDIST2`, defaults.hyperdist2),
      cyb_gold: envInt(`${prefix}CYB_GOLD`, defaults.cyb_gold),
    };
  }
  return config;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function envFloat(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

/**
 * Whether to fill the Cybertron population to tot_to_create at boot (default true).
 * Set CYBERTRON_BOOT_SEED=false to disable (useful for isolated tick-behavior tests).
 */
export function bootSeedEnabled(): boolean {
  return process.env.CYBERTRON_BOOT_SEED !== 'false';
}
