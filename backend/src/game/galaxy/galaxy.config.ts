import { GalaxyConfig } from './galaxy.types';
import { MAXPLSE, PLODDS, WORMODDS } from '../constants';

/**
 * Thrown when an environment variable contains an invalid value for galaxy configuration.
 */
export class GalaxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GalaxyConfigError';
  }
}

/**
 * Parse a uint32 value from an environment variable string.
 * Supports hex literals (0x...) and decimal with underscores (e.g. 12_648_430).
 * If raw is undefined or empty, returns defaultVal.
 *
 * @throws {GalaxyConfigError} if parsed value is outside uint32 range [0, 4294967295]
 */
export function parseUint32(
  raw: string | undefined,
  defaultVal: number,
  fieldName: string,
): number {
  if (raw === undefined || raw === '') {
    return defaultVal;
  }

  const cleaned = raw.replace(/_/g, '');
  const value = cleaned.startsWith('0x') || cleaned.startsWith('0X')
    ? parseInt(cleaned, 16)
    : parseInt(cleaned, 10);

  if (isNaN(value) || value < 0 || value > 4294967295) {
    throw new GalaxyConfigError(
      `${fieldName} must be a uint32 (0–4294967295), got: ${raw}`,
    );
  }

  return value;
}

/**
 * Parse an integer value from an environment variable string, validating it falls
 * within [min, max] inclusive. If raw is undefined or empty, returns defaultVal.
 * No silent clamping — out-of-range values throw.
 *
 * @throws {GalaxyConfigError} if parsed value is outside [min, max]
 */
export function parseRange(
  raw: string | undefined,
  defaultVal: number,
  min: number,
  max: number,
  fieldName: string,
): number {
  if (raw === undefined || raw === '') {
    return defaultVal;
  }

  const value = parseInt(raw, 10);

  if (isNaN(value) || value < min || value > max) {
    throw new GalaxyConfigError(
      `${fieldName} must be between ${min} and ${max}, got: ${raw}`,
    );
  }

  return value;
}

/**
 * Load galaxy generation configuration from environment variables.
 * All fields are optional — missing values fall back to game-balanced defaults
 * derived from the original GEMAIN.H constants.
 *
 * @param env - process.env or equivalent object
 * @returns GalaxyConfig ready for use by GalaxyGeneratorService
 */
export function loadGalaxyConfig(env: NodeJS.ProcessEnv): GalaxyConfig {
  const seed = parseUint32(env.GALAXY_SEED, 0xc0ffee, 'GALAXY_SEED');
  // Defaults come from GAME_CONFIG, which resolves them from the canon values
  // in MBMGEMSG.MSG (PLODDS 3, WORMODDS 6, MAXPLSE 5). They are NOT restated
  // here: this loader used to carry its own copies, which is how PLODDS sat at
  // 4 and WORMODDS at 10 while the option table said otherwise. The
  // GALAXY_*-prefixed env vars remain as a generator-local override.
  const plodds = parseRange(env.GALAXY_PLODDS, PLODDS, 1, 20, 'GALAXY_PLODDS');
  const wormodds = parseRange(env.GALAXY_WORMODDS, WORMODDS, 1, 100, 'GALAXY_WORMODDS');
  const maxplanets = parseRange(env.GALAXY_MAXPLANETS, MAXPLSE, 1, 9, 'GALAXY_MAXPLANETS');

  return { seed, plodds, wormodds, maxplanets };
}
