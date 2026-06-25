import { HPDAMMAX, HPFIRDST, MINEDAMMAX, MINERANGE, PDAMMAX, PFIRDST, PHABIAS, PRELOAD, SHIELD_FACTOR, SHMINCHG, TONFACT } from '../constants';
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
 * True if `b` is within `scanRange` raw units of `a`.
 *
 * Bridges the two coordinate scales used by the port: `cdistance()` returns
 * sector-units (1 sector = 1.0), while every `scanRange` value is stored in
 * raw units (1 sector = 10_000). Hides the `* 10_000` conversion that was
 * historically duplicated across ~10 fire/scan call sites.
 *
 * UNITS: `scanRange` must be in **raw units** (e.g. Interceptor=15_000,
 * Dreadnought=40_000, Cybertron Base Star=40_000). Passing a sector-unit
 * value (e.g. `1.5`) would make the result always-true since
 * `cdistance × 10_000` rarely beats single-digit numbers. The guard below
 * throws to catch this mistake at the call site; `0` is allowed as the
 * "no scanner" sentinel.
 */
export function inScanRange(
  a: { xcoord: number; ycoord: number },
  b: { xcoord: number; ycoord: number },
  scanRange: number,
): boolean {
  if (scanRange !== 0 && scanRange < 1000) {
    throw new Error(
      `inScanRange: scanRange=${scanRange} looks like sector-units; expected raw units (×10_000) or 0`,
    );
  }
  return cdistance(a, b) * 10_000 <= scanRange;
}

/**
 * True if `victim` lies within `halfAngleDeg` degrees of the firing direction
 * `firer.heading + degree`. This is the shared arc core used by both the
 * normal phaser (`lineOfFire`, half-angle `focus + PHABIAS`) and the
 * hyper-phaser (fixed `HPBEAMW` half-angle, GECMDS.C:1050).
 *
 * `degree` is the player's RELATIVE bearing (−180..180, per
 * GEFUNCS.C:valdegree). Mirrors the original hit test
 * `smallest(vector(firer,victim), heading+degree) < halfAngleDeg`.
 *
 * @see GEFUNCS.C:smallest, vector
 */
export function withinArc(
  firer: { xcoord: number; ycoord: number; heading: number },
  victim: { xcoord: number; ycoord: number },
  degree: number,
  halfAngleDeg: number,
): boolean {
  const dx = victim.xcoord - firer.xcoord;
  const dy = victim.ycoord - firer.ycoord;
  if (dx === 0 && dy === 0) return false;
  // Absolute compass direction to victim: north=0, clockwise. y increases downward so -dy.
  const victimAngle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  // Absolute firing direction = firer heading + relative degree.
  const firingAngle = (firer.heading + degree + 360) % 360;
  let diff = Math.abs(victimAngle - firingAngle);
  if (diff > 180) diff = 360 - diff;
  return diff < halfAngleDeg;
}

/**
 * True if `victim` lies within the NORMAL phaser firing arc of `firer`.
 *
 * The beam half-angle is `focus + PHABIAS` degrees, matching the original hit
 * test `smallest(vector(firer,victim), heading+degree) < focus + PHABIAS`.
 * Delegates to {@link withinArc} — behavior is byte-identical to the prior
 * inlined implementation.
 *
 * @see GECMDS.C:942,953-954 firep
 */
export function lineOfFire(
  firer: { xcoord: number; ycoord: number; heading: number },
  victim: { xcoord: number; ycoord: number },
  degree: number,
  focus: number,
): boolean {
  return withinArc(firer, victim, degree, focus + PHABIAS);
}

/**
 * Normal-phaser damage: ports `pdamage` (GEFUNCS.C:2060) plus the `firep`
 * outer scaling (GECMDS.C:956-973).
 *
 *   disfact = 20000 + phasrtype*4000
 *   dd      = max(0, 1 - distRaw/disfact)
 *   fd      = 1 - focus/11
 *   dp      = dd^PFIRDST * fd² * (phasr/100)
 *   dam     = PDAMMAX * dp
 *   factor  = dam * (1+phasrtype)/2.5 / (1 + victimMaxTons/TONFACT)
 *   if victimAtWarp: factor /= 2
 *   if phasrtype == 20 (sysop): return 101
 *
 * @see GEFUNCS.C:2060 pdamage  @see GECMDS.C:956-973 firep
 */
export function phaserDamage(args: {
  phasrtype: number;
  phasr: number;
  distRaw: number;
  focus: number;
  victimMaxTons: number;
  victimAtWarp: boolean;
}): number {
  const { phasrtype, phasr, distRaw, focus, victimMaxTons, victimAtWarp } = args;
  if (phasrtype === 20) return 101; // sysop phaser
  const disfact = 20000 + phasrtype * 4000;
  const dd = Math.max(0, 1 - distRaw / disfact);
  const fd = 1 - focus / 11;
  const dp = Math.pow(dd, PFIRDST) * (fd * fd) * (phasr / 100);
  const dam = PDAMMAX * dp;
  const tonfact = 1 + victimMaxTons / TONFACT;
  let factor = (dam * ((1 + phasrtype) / 2.5)) / tonfact;
  if (victimAtWarp) factor /= 2;
  return Math.floor(factor);
}

/**
 * Hyper-phaser damage: ports the `pdamage` WARP branch (GEFUNCS.C:2069-2077,
 * firer `where==1`) folded into `firehp`'s outer scaling (GECMDS.C:1056-1067).
 *
 *   dd     = max(0, 1 - distRaw/40000)
 *   dp     = dd^HPFIRDST
 *   dam    = HPDAMMAX * dp
 *   factor = dam * phasrtype / (1 + victimMaxTons/TONFACT)
 *   if phasrtype == 20 (sysop): return 101
 *
 * Note the multiplier here is `* phasrtype` (NOT the normal path's
 * `* (1+phasrtype)/2.5`), and the distance divisor is the fixed 40000 of the
 * warp branch (not the phasrtype-scaled `disfact`).
 *
 * @see GEFUNCS.C:2069 pdamage (warp branch)  @see GECMDS.C:1020 firehp
 */
export function hyperPhaserDamage(args: {
  phasrtype: number;
  distRaw: number;
  victimMaxTons: number;
}): number {
  const { phasrtype, distRaw, victimMaxTons } = args;
  if (phasrtype === 20) return 101; // sysop phaser
  const dd = Math.max(0, 1 - distRaw / 40000);
  const dp = Math.pow(dd, HPFIRDST);
  const dam = HPDAMMAX * dp;
  const tonfact = 1 + victimMaxTons / TONFACT;
  const factor = (dam * phasrtype) / tonfact;
  return Math.floor(factor);
}

/**
 * Per-class damage scaling: the multiplier applied to a rolled hit, equal to
 * `100 / victim.damageFactor`. This is the C `ton_fact(victim, dmg)` =
 * `dmg / (shipclass[victim].damfact / 100)` rearranged to a multiplier.
 * Higher damageFactor = tougher (takes less). Non-positive guards to 1.0.
 *
 * @see GEFUNCS.C:2661 ton_fact
 */
export function damageScale(damageFactor: number): number {
  if (damageFactor <= 0) return 1;
  return 100 / damageFactor;
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
 * Hull damage roll for projectile hits, scaled by the victim's per-class
 * damageFactor: `floor(rand * dmgMax * damageScale(victimDamageFactor))`.
 *
 * @see GEFUNCS.C:1546 incoming-weapon hit resolution + ton_fact
 */
export function rollHullDamage(rand: Random, dmgMax: number, victimDamageFactor: number): number {
  return Math.floor(rand.next() * dmgMax * damageScale(victimDamageFactor));
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

export type RandamageSubsystem = 'shield' | 'phasor' | 'firecntl' | 'cloak' | 'tactical' | 'helm' | 'none' | 'skipped';
export interface RandamageResult {
  subsystem: RandamageSubsystem;
  magnitude: number;
}

/** Capability gates for the six subsystem cases. */
export interface RandamageCaps {
  hasShields: boolean;
  hasPhasers: boolean;
  hasTorpOrMissile: boolean;
  hasCloak: boolean;
}

/**
 * Pure subsystem-damage roll. Returns the subsystem hit and the value to
 * assign to that field. NO ship mutation — call {@link applyRandamage} to mutate.
 *
 * Only fires when `damagePct > 20`. Rolls `floor(rand * (101-damagePct)/1.5)`;
 * if the result is 0, picks a case 0-5 via `gernd()%6` and returns the hit.
 * If the rolled case lacks the ship capability, returns `{subsystem:'none'}`.
 *
 * magnitude: shield/phasor/cloak/tactical/helm = `-floor(rand*(damagePct+10))`;
 *            firecntl = `floor(rand*65536)%20` (positive, 0-19).
 *
 * @see GEFUNCS.C:randamage line 1956
 */
export function rollRandamage(
  rand: Random,
  damagePct: number,
  caps: RandamageCaps,
): RandamageResult {
  const none: RandamageResult = { subsystem: 'none', magnitude: 0 };

  if (damagePct <= 20) return none;

  const roll = Math.floor(rand.next() * ((101 - damagePct) / 1.5));
  if (roll !== 0) return none;

  const which = Math.floor(rand.next() * 65536) % 6;

  switch (which) {
    case 0: {
      if (!caps.hasShields) return none;
      const magnitude = -Math.floor(rand.next() * (damagePct + 10));
      return { subsystem: 'shield', magnitude };
    }
    case 1: {
      if (!caps.hasPhasers) return none;
      const magnitude = -Math.floor(rand.next() * (damagePct + 10));
      return { subsystem: 'phasor', magnitude };
    }
    case 2: {
      if (!caps.hasTorpOrMissile) return none;
      const magnitude = Math.floor(rand.next() * 65536) % 20;
      return { subsystem: 'firecntl', magnitude };
    }
    case 3: {
      if (!caps.hasCloak) return none;
      const magnitude = -Math.floor(rand.next() * (damagePct + 10));
      return { subsystem: 'cloak', magnitude };
    }
    case 4: {
      const magnitude = -Math.floor(rand.next() * (damagePct + 10));
      return { subsystem: 'tactical', magnitude };
    }
    case 5: {
      const magnitude = -Math.floor(rand.next() * (damagePct + 10));
      return { subsystem: 'helm', magnitude };
    }
    default:
      return none;
  }
}

/**
 * Cubic distance falloff for mine damage, scaled by the victim's per-class
 * damageFactor: `MINEDAMMAX * (1 - d/MINERANGE)^3 * damageScale(victimDamageFactor)`.
 *
 * @see GEFUNCS.C:minesweep + ton_fact
 */
export function mineFalloff(distance: number, victimDamageFactor: number): number {
  if (distance >= MINERANGE) return 0;
  const factor = 1 - distance / MINERANGE;
  return Math.floor(MINEDAMMAX * factor * factor * factor * damageScale(victimDamageFactor));
}

/**
 * Lock-quality factor for a torpedo/missile (GECMDS.C:1378-1392). Returns an
 * unbounded quality score (not a 0-1 probability); caller fires only when the
 * result is > 0.7.
 *
 * @param kind        'torpedo' or 'missile'
 * @param firerSpeed  firer's current speed
 * @param targetSpeed target's current speed
 * @param distSectors cdistance(firer, target) in sector units
 * @param factor      TORFACT (torpedo) or MISFACT (missile)
 */
export function lockFact(
  kind: 'torpedo' | 'missile',
  firerSpeed: number,
  targetSpeed: number,
  distSectors: number,
  factor: number,
): number {
  if (kind === 'torpedo') {
    if (targetSpeed > 999) return 0; // target at warp — torpedoes cannot lock
    const speed = firerSpeed + targetSpeed;
    return (1.2 - speed / 5000) * ((5.0 - distSectors) / factor);
  }
  return (5.0 - distSectors) / factor;
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
