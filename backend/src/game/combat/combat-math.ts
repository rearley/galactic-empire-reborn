import { MINEDAMMAX, MINERANGE, PHABIAS, SHHITENG } from '../constants';
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
 * Bearings are degrees with north = 0, increasing clockwise.
 *
 * @see GEFUNCS.C:firephas
 */
export function lineOfFire(
  firer: { xcoord: number; ycoord: number },
  victim: { xcoord: number; ycoord: number },
  bearing: number,
  beamWidth: number,
): boolean {
  const dx = victim.xcoord - firer.xcoord;
  const dy = victim.ycoord - firer.ycoord;
  if (dx === 0 && dy === 0) return false;
  // atan2(x, y) → north=0, clockwise, in radians
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  const normalized = ((angle % 360) + 360) % 360;
  const halfWidth = (beamWidth + PHABIAS) / 2;
  let diff = Math.abs(normalized - bearing);
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
 * Apply incoming damage through shields. Each unit of shield absorbs one
 * point of damage and drains `SHHITENG` energy from the shield reserve.
 *
 * @see GEFUNCS.C:shieldhit
 */
export function shieldhit(
  shield: number,
  damage: number,
  shieldUp: boolean,
): { newShield: number; hullDamage: number; shieldDamage: number } {
  if (!shieldUp || shield <= 0) {
    return { newShield: shield, hullDamage: damage, shieldDamage: 0 };
  }
  // Shield can absorb up to floor(shield / SHHITENG) points of damage.
  const absorbCapacity = Math.floor(shield / SHHITENG);
  const absorbed = Math.min(absorbCapacity, damage);
  const energyDrained = absorbed * SHHITENG;
  return {
    newShield: Math.max(0, shield - energyDrained),
    hullDamage: damage - absorbed,
    shieldDamage: absorbed,
  };
}

/**
 * Randomized damage roll: `floor(rand * dmgMax * tonFact(ton))`.
 * @see GEFUNCS.C:randamage
 */
export function randamage(rand: Random, dmgMax: number, ton: number): number {
  return Math.floor(rand.next() * dmgMax * tonFact(ton));
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
