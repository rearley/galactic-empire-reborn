/**
 * Per-class tunable config for Droid AI ships.
 * Defaults verbatim from GEDROIDS.C and the original C-source class table.
 * Override via env: DROID_CLASS_<N>_SCAN_RANGE, etc.
 *
 * @see GEDROIDS.C — droid_init, droid_act_class_10/11/12
 * @see reference/ge-source/GEMAIN.H — class table (scanrange, max_phasr, max_shlds, topspeed)
 */

export interface DroidClassConfig {
  /** Per-class scan range in internal units. @see GEDROIDS.C:276 ddist < scanrange */
  scanRange: number;
  /** Top speed in warp units (×1000 for internal speed). @see GEDROIDS.C:398 topspeed*1000 */
  topspeed: number;
  /** Max phaser charge level. @see GEDROIDS.C:droid_init:142 max_phasr */
  maxPhaser: number;
  /** Max shield level. @see GEDROIDS.C:droid_init:143 max_shlds */
  maxShields: number;
}

export interface DroidGlobalConfig {
  /** Distance gate for hyperspace phaser fire. @see GEDROIDS.C:351/458 ddist < 30000 */
  fightbackHyperspaceMaxDist: number;
  /** Murdonian confuse roll denominator. @see GEDROIDS.C:371 gernd()%10 == 0 */
  confuseDenom_class11: number;
  /** Vakory alter-attack-vector roll denominator. @see GEDROIDS.C:491 gernd()%20 == 1 */
  alterVectorDenom_class12: number;
  /** Damage threshold triggering Vakory mine+jammer+flee. @see GEDROIDS.C:503 damage > 75 */
  vakoryDamageThreshold: number;
}

/** Class-specific defaults (verbatim from reference/wiki/cpu-ships.md and GEDROIDS.C). */
export const DROID_CLASS_DEFAULTS: Record<number, DroidClassConfig> = {
  // Lydorian Garbage Scow — class 31
  31: { scanRange: 3_750, topspeed: 1, maxPhaser: 1, maxShields: 1 },
  // Murdonian Transport — class 32
  32: { scanRange: 3_750, topspeed: 8, maxPhaser: 5, maxShields: 2 },
  // Vakory Survey Drone — class 33
  33: { scanRange: 3_750, topspeed: 4, maxPhaser: 1, maxShields: 1 },
};

export const DROID_GLOBAL_DEFAULTS: DroidGlobalConfig = {
  fightbackHyperspaceMaxDist: 30_000,
  confuseDenom_class11: 10,
  alterVectorDenom_class12: 20,
  vakoryDamageThreshold: 75,
};

export function buildDroidConfig(): {
  classes: Record<number, DroidClassConfig>;
  global: DroidGlobalConfig;
} {
  const classes: Record<number, DroidClassConfig> = {};
  for (const [classNumStr, defaults] of Object.entries(DROID_CLASS_DEFAULTS)) {
    const n = Number(classNumStr);
    const prefix = `DROID_CLASS_${n}_`;
    classes[n] = {
      scanRange: envInt(`${prefix}SCAN_RANGE`, defaults.scanRange),
      topspeed: envInt(`${prefix}TOPSPEED`, defaults.topspeed),
      maxPhaser: envInt(`${prefix}MAX_PHASER`, defaults.maxPhaser),
      maxShields: envInt(`${prefix}MAX_SHIELDS`, defaults.maxShields),
    };
  }
  const global: DroidGlobalConfig = {
    fightbackHyperspaceMaxDist: envInt('DROID_FIGHTBACK_HYPER_DIST', DROID_GLOBAL_DEFAULTS.fightbackHyperspaceMaxDist),
    confuseDenom_class11: envInt('DROID_CONFUSE_DENOM_11', DROID_GLOBAL_DEFAULTS.confuseDenom_class11),
    alterVectorDenom_class12: envInt('DROID_ALTER_VECTOR_DENOM_12', DROID_GLOBAL_DEFAULTS.alterVectorDenom_class12),
    vakoryDamageThreshold: envInt('DROID_VAKORY_DAMAGE_THRESHOLD', DROID_GLOBAL_DEFAULTS.vakoryDamageThreshold),
  };
  return { classes, global };
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
