/**
 * Per-class tunable config for Cybertron/Sartern AI ships.
 * Values sourced verbatim from reference/ge-source/GECYBS.C class table.
 * Override via env: CYBERTRON_CLASS_<N>_TOT_TO_CREATE, _TOOCLOSE, _HYPERDIST1, _HYPERDIST2, _CYB_GOLD.
 *
 * @see GECYBS.C class table — tot_to_create, hyperdist1, hyperdist2
 *
 * NOTE `tooclose` and `cyb_gold` are NOT per-class. C reads each as a single
 * global sysop option and applies it to every automaton (`gernd()%cyb_gold` at
 * GECYBS.C:170). This table carried per-class copies ranging 10_000..200_000
 * for cyb_gold — every one of them above the option's own legal maximum of
 * 32_000, so killing a Cybertron paid a fortune the original could not produce
 * and the whole progression curve behind it collapsed. They now come from
 * GAME_CONFIG; the per-class shape is kept only so the call sites stay uniform.
 * @see specs/007-cybertron-ai/plan.md R-6 (config split rationale)
 */

import { CYBGOLD, HYPDST1, HYPDST2, TOOCLOSE, UNIVMAX } from '../constants';
import { CANON_TOT_TO_CREATE, scaleAiPopulation } from './cyb-population';
import { PORT_RULES, type AiHouseRules } from '../ai/house-rules';
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
export const CYBERTRON_CLASS_DEFAULTS: Record<number, CybertronClassConfig> =
  Object.fromEntries(
    Object.entries(CANON_TOT_TO_CREATE).map(([cls, canonCount]) => [
      Number(cls),
      {
        // Canon's count, scaled to the galaxy we actually run. A no-op at
        // canon's UNIVMAX 300. @see ./cyb-population.ts for why this exists
        // and why it scales linearly rather than by area.
        tot_to_create: scaleAiPopulation(canonCount, UNIVMAX),
        tooclose: TOOCLOSE,
        // HYPDST1/HYPDST2 were hardcoded here as 25 and 10 — canon's values,
        // so behaviour was right, but the sysop options of the same name had
        // no consumer and tuning them did nothing. Now read from the option
        // table like every other setting.
        hyperdist1: HYPDST1,
        hyperdist2: HYPDST2,
        cyb_gold: CYBGOLD,
      },
    ]),
  ) as Record<number, CybertronClassConfig>;

/**
 * Build the resolved config for all AI classes, merging env overrides with defaults.
 * Env pattern: CYBERTRON_CLASS_21_TOT_TO_CREATE=8, CYBERTRON_CLASS_24_HYPERDIST1=30, etc.
 * Called once at module initialization.
 */
export function buildCybertronClassConfigs(rules: AiHouseRules = PORT_RULES): Record<number, CybertronClassConfig> {
  const config: Record<number, CybertronClassConfig> = {};
  for (const [classNumStr, defaults] of Object.entries(CYBERTRON_CLASS_DEFAULTS)) {
    const n = Number(classNumStr);
    const prefix = `CYBERTRON_CLASS_${n}_`;
    // PORT-ORIGINAL @house-rule scalePopulation — canon's counts are for a
    // galaxy three times the size of ours. Off, canon's own.
    const count = rules.scalePopulation ? defaults.tot_to_create : CANON_TOT_TO_CREATE[n];
    config[n] = {
      tot_to_create: envInt(`${prefix}TOT_TO_CREATE`, count),
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

/**
 * Cone half-width a Cybertron uses when engaging in normal space.
 *
 * Canon writes it inline beside the bearing, immediately before `cyb_attack`:
 *
 *   ptr->degrees = (int)(cbearing(...)+.5);
 *   ptr->percent = 2;
 *
 * @see GECYBS.C:281-282
 *
 * Deliberately NOT in `game/constants.ts`: that file mirrors `GEMAIN.H`
 * #defines and is pinned field-for-field against it by
 * test/unit/gemain-pins.spec.ts. Canon has no `CYB_PHASER_FOCUS` define — this
 * is a literal in the AI source — so putting it there would assert a canon
 * constant that does not exist.
 */
export const CYB_PHASER_FOCUS = 2 as const;
