import { MINEDAMMAX, MINERANGE, PHABIAS, PRELOAD, SHIELD_FACTOR, SHMINCHG } from '../constants';
import { Random } from './random.port';

/**
 * Pure, side-effect-free combat math. All functions are deterministic given
 * their inputs (and an injected PRNG, where applicable).
 *
 * @see GEFUNCS.C — original C implementations cited per function
 */

/** @see GEFUNCS.C:cdistance */
export function cdistance(
  a: { xcoord: number; ycoord: number },
  b: { xcoord: number; ycoord: number },
): number {
  const dx = b.xcoord - a.xcoord;
  const dy = b.ycoord - a.ycoord;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * True if `victim` lies within the firing arc of `firer` at `bearing`,
 * with a half-width of `(beamWidth + PHABIAS) / 2` degrees on each side.
 *
 * `bearing` is relative to firer's heading (0 = straight ahead), matching the
 * original `deg = normal(ptr->heading + ptr->degrees)` in GECMDS.C:firep.
 *
 * @see GECMDS.C:firep (deg = ptr->heading + ptr->degrees; vector() absolute angle)
 */
export function lineOfFire(
  firer: { xcoord: number; ycoord: number; heading: number },
  victim: { xcoord: number; ycoord: number },
  bearing: number,
  beamWidth: number,
): boolean {
  const dx = victim.xcoord - firer.xcoord;
  const dy = victim.ycoord - firer.ycoord;
  if (dx === 0 && dy === 0) return false;
  // Absolute compass direction to victim: north=0, clockwise. y increases downward so -dy.
  const victimAngle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  // Absolute firing direction = firer heading + relative bearing (mirrors original firep).
  const firingAngle = (firer.heading + bearing + 360) % 360;
  const halfWidth = (beamWidth + PHABIAS) / 2;
  let diff = Math.abs(victimAngle - firingAngle);
  if (diff > 180) diff = 360 - diff;
  return diff <= halfWidth;
}

/**
 * Phaser damage formula: `(percent / 100) * maxPhaser / (1 + range / 100)`.
 * @see GEFUNCS.C:firephas
 */
export function phaserDamage(percent: number, range: number, maxPhaser: number): number {
  return ((percent / 100) * maxPhaser) / (1 + range / 100);
}

/**
 * Tonnage scaling factor: `clamp(tonnage / 10000, 0.1, 1.0)`.
 * @see GEFUNCS.C:ton_fact
 */
export function tonFact(tonnage: number): number {
  const f = tonnage / 10000.0;
  return Math.min(1.0, Math.max(0.1, f));
}

/**
 * Apply incoming damage through raised shields.
 * Shields completely absorb the hit (hullDamage = 0); shield charge drains by `knock`.
 * Returns knockedDown=true when charge falls below SHMINCHG (shield collapses).
 *
 * Formula: dmax = 80 - (shieldtype * SHIELD_FACTOR); knock = floor(dmax * damage/100)
 * shieldtype 20 is impenetrable (dmax = 0, no charge drain).
 *
 * @see GEFUNCS.C:2430 shieldhit
 */
export function shieldhit(
  shieldCharge: number,
  shieldtype: number,
  damage: number,
): { newCharge: number; hullDamage: number; shieldConsumed: number; knockedDown: boolean } {
  const dmax = shieldtype === 20 ? 0 : Math.max(0, 80 - shieldtype * SHIELD_FACTOR);
  const knock = Math.floor(dmax * (damage / 100));
  let newCharge = shieldCharge - knock;
  let knockedDown = false;

  if (newCharge <= 2) {
    // Shield critically damaged — extra drain, collapses
    newCharge = newCharge - knock * 3;
    knockedDown = true;
  } else if (newCharge < SHMINCHG) {
    knockedDown = true;
  }

  return { newCharge, hullDamage: 0, shieldConsumed: knock, knockedDown };
}

/**
 * Hull damage roll for projectile hits: `floor(rand * dmgMax * tonFact(ton))`.
 *
 * This is the projectile-hit damage formula used in combat-tick.service.ts.
 * It is distinct from the C `randamage()` subsystem-damage routine — see
 * `randamage()` below for the faithful C implementation.
 *
 * @see GEFUNCS.C:1546 — incoming-weapon hit resolution
 */
export function rollHullDamage(rand: Random, dmgMax: number, ton: number): number {
  return Math.floor(rand.next() * dmgMax * tonFact(ton));
}

/**
 * Per-tick phaser reload amount: `phasrtype * PRELOAD`.
 *
 * phasrtype=0 means no phaser mounted (returns 0).
 * The Interceptor class double-reload bonus (`if shpclass==2 preload*=2`) is
 * commented out in the shipped C source and is intentionally absent here.
 *
 * @see GEFUNCS.C:checkdam line 1031
 */
export function phaserReloadAmount(phasrtype: number): number {
  return phasrtype * PRELOAD;
}

/**
 * Assess random subsystem damage after a hit.
 *
 * Only fires when `damagePct > 20`. Rolls rndm((101 - damagePct) / 1.5);
 * if 0, picks a subsystem (0–5) via gernd()%6 and damages it.
 * Returns an object describing what (if anything) was hit.
 *
 * shieldtype === 20 (special shield class) is immune to random damage.
 *
 * @see GEFUNCS.C:randamage line 1956
 */
export function randamage(
  rand: Random,
  damagePct: number,
  shieldtype: number,
): { subsystem: 'shield' | 'phasor' | 'weapons' | 'engine' | 'none' | 'skipped' } {
  if (shieldtype === 20) return { subsystem: 'skipped' };
  if (damagePct <= 20) return { subsystem: 'none' };

  const roll = Math.floor(rand.next() * ((101 - damagePct) / 1.5));
  if (roll !== 0) return { subsystem: 'none' };

  const which = Math.floor(rand.next() * 65536) % 6;
  const subsystems = ['shield', 'phasor', 'weapons', 'weapons', 'engine', 'engine'] as const;
  return { subsystem: subsystems[which] };
}

/**
 * Cubic distance falloff for mine damage: damage scales with `(1 - d/MINERANGE)^3`,
 * scaled by tonFact, capped at MINEDAMMAX.
 *
 * @see GEFUNCS.C:minesweep
 */
export function mineFalloff(distance: number, ton: number): number {
  if (distance >= MINERANGE) return 0;
  const factor = 1 - distance / MINERANGE;
  return Math.floor(MINEDAMMAX * factor * factor * factor * tonFact(ton));
}

/**
 * Roll for decoy intercept. `decodds` is a 0-100 integer probability.
 * @see GECMDS.C:cmd_decoy
 */
export function decoyIntercept(rand: Random, decodds: number): boolean {
  return rand.next() * 100 < decodds;
}

/**
 * Jammer area-effect counter for a ship at `distance` from the carrier.
 * Returns 0 outside scan range; otherwise linearly decays from `jamtime`
 * at distance 0 to 0 at `scanrange`.
 *
 * @see GECMDS.C:cmd_jammer 1593-1651
 */
export function jammerCounter(distance: number, scanrange: number, jamtime: number): number {
  if (distance > scanrange) return 0;
  return Math.floor(jamtime * (1 - distance / scanrange));
}

/**
 * Human-readable damage description for status displays.
 * @see GEFUNCS.C:damstr
 */
export function damstr(damagePct: number): string {
  if (damagePct < 10) return 'Undamaged';
  if (damagePct < 25) return 'Light';
  if (damagePct < 50) return 'Moderate';
  if (damagePct < 75) return 'Heavy';
  if (damagePct < 90) return 'Critical';
  return 'Destroyed';
}
