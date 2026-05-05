import { MAILDAYS_DEFAULT, CHGLOSER_DEFAULT } from './midnight.constants';

export interface MidnightConfig {
  mailDays: number;
  chgLoserPercent: number;
  adminToken: string | undefined;
}

/**
 * Load and validate the midnight-job env configuration.
 * Mirrors the pattern from backend/src/game/cybertron/cybertron.config.ts.
 *
 * Env vars:
 *   MIDNIGHT_MAILDAYS    — integer 1–30, default 7
 *   MIDNIGHT_CHGLOSER   — integer 0–100, default 100
 *   MIDNIGHT_ADMIN_TOKEN — optional string
 */
export function loadMidnightConfig(env: NodeJS.ProcessEnv = process.env): MidnightConfig {
  const mailDays = clampInt(envInt('MIDNIGHT_MAILDAYS', env, MAILDAYS_DEFAULT), 1, 30);
  const chgLoserPercent = clampInt(envInt('MIDNIGHT_CHGLOSER', env, CHGLOSER_DEFAULT), 0, 100);
  const adminToken = env['MIDNIGHT_ADMIN_TOKEN'] || undefined;

  return { mailDays, chgLoserPercent, adminToken };
}

function envInt(key: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
