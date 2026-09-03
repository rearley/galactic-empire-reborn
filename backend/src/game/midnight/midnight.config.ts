import { MAILDAYS_DEFAULT, CHGLOSER_DEFAULT } from './midnight.constants';

/** Canon `numopt` bounds for MAILDAYS. @see GEMAIN.C:497 */
const MAILDAYS_MIN = 1;
const MAILDAYS_MAX = 7;

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
 *   MIDNIGHT_MAILDAYS    — integer 1–7, default 3 (canon MAILDAYS)
 *   MIDNIGHT_CHGLOSER   — integer 0–100, default 100
 *   MIDNIGHT_ADMIN_TOKEN — optional string
 */
export function loadMidnightConfig(env: NodeJS.ProcessEnv = process.env): MidnightConfig {
  // Canon bounds, not this port's taste: `numopt(MAILDAYS,1,7)`. The 1..30 that
  // used to be here let a sysop set a retention window the original refuses.
  // @see GEMAIN.C:497, GE/REL/MBMGEMSG.MSG:449 `MAILDAYS {...: 3} N 1 7`
  const mailDays = clampInt(envInt('MIDNIGHT_MAILDAYS', env, MAILDAYS_DEFAULT), MAILDAYS_MIN, MAILDAYS_MAX);
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
