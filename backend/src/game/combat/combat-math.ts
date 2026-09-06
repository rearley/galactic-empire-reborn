import { DESTRUCTRANGE, HPDAMMAX, HPFIRDST, MDAMMAX, MINEDAMMAX, MINERANGE, MISSILE_CHARGE_MAX, MOVENGMIN, PDAMMAX, PFIRDST, PHABIAS, PHATOWRP, PRELOAD, SHIELD_FACTOR, SHMINCHG, TONFACT } from '../constants';
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
  // C declares `unsigned dam`, so the base is truncated HERE — before firep
  // scales it by phasrtype and tonnage. @see GEFUNCS.C:2065, 2088
  const dam = Math.trunc(PDAMMAX * dp);
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
  // `unsigned dam` — truncated before firehp's outer scaling. @see GEFUNCS.C:2065, 2077
  const dam = Math.trunc(HPDAMMAX * dp);
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

/** The three ways a shield hit can land. @see GEFUNCS.C:2453-2469 */
export type ShieldHitOutcome =
  /** `shield <= 2` — SHDAMAG. Shields blow into SHIELDDM and take a further knock*3. */
  | 'damaged'
  /** `shield < SHMINCHG` — SHKNKDN. A warning only; the shields STAY UP. */
  | 'warned'
  /** Still comfortably charged. */
  | 'none';

/**
 * Apply incoming damage through raised shields.
 *
 * Shields absorb the hit entirely (hullDamage = 0) and lose `knock` charge:
 *
 *   dmax  = 80 - shieldtype * SHIELD_FACTOR   (type 20 is impenetrable, dmax 0)
 *   knock = floor(dmax * damage/100)
 *
 * The result then splits three ways, and the distinction matters: only the
 * `damaged` branch takes the shields out of action, and it does so into
 * SHIELDDM — a state `shi up` refuses and only the repair climb clears. The
 * `warned` branch prints a warning and changes nothing. Collapsing the two,
 * as the port used to, made shields fail two charge points early and fail into
 * a freely re-raisable state, which put the whole repair path out of reach of
 * combat.
 *
 * @see GEFUNCS.C:2430 shieldhit
 */
export function shieldhit(
  shieldCharge: number,
  shieldtype: number,
  damage: number,
): {
  newCharge: number;
  hullDamage: number;
  shieldConsumed: number;
  outcome: ShieldHitOutcome;
} {
  const dmax = shieldtype === 20 ? 0 : Math.max(0, 80 - shieldtype * SHIELD_FACTOR);
  const knock = Math.floor(dmax * (damage / 100));
  let newCharge = shieldCharge - knock;
  let outcome: ShieldHitOutcome = 'none';

  if (newCharge <= 2) {
    newCharge = newCharge - knock * 3;
    outcome = 'damaged';
  } else if (newCharge < SHMINCHG) {
    outcome = 'warned';
  }

  return { newCharge, hullDamage: 0, shieldConsumed: knock, outcome };
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

/** Mine shields-up divisor spread: `gernd()%5`. @see GEFUNCS.C:1447 */
export const MINE_SHIELD_DIVISOR_SPREAD = 5 as const;
/** Mine shields-up drain bonus: `shieldhit(..., damage+20)`. @see GEFUNCS.C:1450 */
export const MINE_SHIELD_DRAIN_BONUS = 20 as const;

/**
 * Mine hull damage when the victim's shields are raised.
 *
 * GEFUNCS.C:1447 divides the falloff damage by `gernd()%5 + shieldtype`, so a
 * higher shield Mark reduces mine damage. Hull damage is still applied — the
 * common `wptr->damage += damage` at GEFUNCS.C:1463 runs for both branches.
 *
 * Shield CHARGE plays no part here; it is the pool that decides how long shields
 * remain up, not a damage multiplier.
 *
 * @see GEFUNCS.C:1441-1463 mine detonation
 */
export function mineShieldedDamage(rand: Random, damage: number, shieldtype: number): number {
  const divisor = Math.floor(rand.next() * MINE_SHIELD_DIVISOR_SPREAD) + shieldtype;
  if (divisor <= 0) return Math.floor(damage);
  return Math.floor(damage / divisor);
}

/** Shield drain roll on a shielded projectile hit: `(gernd()%20)+10`. @see GEFUNCS.C:1563 */
export const SHIELD_DRAIN_MIN = 10 as const;
export const SHIELD_DRAIN_SPREAD = 20 as const;

/**
 * Projectile hull damage, branching on whether the victim's shields are up.
 *
 * GEFUNCS.C:1552-1576 applies hull damage in BOTH branches — raising shields
 * halves the incoming roll and costs charge, it does not grant immunity:
 *
 *   shields UP    damfact = tdammax * rndm(.5)        -> [0, 0.5) * dmgMax
 *   shields DOWN  damfact = tdammax * (rndm(.5)+.5)   -> [0.5, 1) * dmgMax
 *
 * Both are then passed through ton_fact, which is damageScale here.
 *
 * @see GEFUNCS.C:1552 torpedo hit  @see GEFUNCS.C:2661 ton_fact
 */
export function rollProjectileHullDamage(
  rand: Random,
  dmgMax: number,
  victimDamageFactor: number,
  shieldsUp: boolean,
): number {
  const factor = shieldsUp ? rand.next() * 0.5 : rand.next() * 0.5 + 0.5;
  // NOT floored — `ptr->damage += damfact` (GEFUNCS.C:1574) has no cast. Less
  // dramatic than the missile case since a torpedo's roll is larger, but it was
  // shaving up to a point off every hit.
  return dmgMax * factor * damageScale(victimDamageFactor);
}

/**
 * Missile hull damage.
 *
 * A missile carries a stored *charge* in the range 1..50000, which is an energy
 * value, not a damage cap. C normalises it against the 50000 ceiling and scales
 * the result by `mdammax` (clamped 1..100), so no missile can ever do more than
 * MDAMMAX hull damage no matter how much energy it was loaded with:
 *
 *   damfact = ton_fact(ptr, energy);
 *   damfact = damfact / 50000.0;
 *   damfact = damfact * (shields ? rndm(.1) : rndm(.5)+.5);
 *   ptr->damage += mdammax * damfact;
 *
 * Note the shields-up roll is `rndm(.1)` — a tenth of the torpedo's `rndm(.5)`.
 * Missiles are the weapon shields are best against.
 *
 * @see GEFUNCS.C:1620-1660
 */
export function rollMissileHullDamage(
  rand: Random,
  charge: number,
  victimDamageFactor: number,
  shieldsUp: boolean,
): number {
  const adjusted = charge * damageScale(victimDamageFactor);
  const factor = shieldsUp ? rand.next() * 0.1 : rand.next() * 0.5 + 0.5;
  // NOT floored. `WARSHP.damage` is a double (GEMAIN.H:332) and canon adds to
  // it uncast: `ptr->damage += mdammax*damfact` (GEFUNCS.C:1644, :1658). The
  // phaser is the deliberate exception, truncating at GECMDS.C:969.
  //
  // Flooring here deleted every hit worth less than a point, and against a
  // SHIELDED target the roll is `rndm(.1)` — so a 20,000-charge missile on a
  // 90-damfact hull earns 0.2-1.0 hull and scored ZERO on almost every hit.
  // A full volley that should have taken ~8% off did nothing at all.
  return MDAMMAX * (adjusted / MISSILE_CHARGE_MAX) * factor;
}

/**
 * Shield charge drained by a missile hit. Unlike a torpedo — which uses a flat
 * 10..29 roll — a missile's drain is proportional to the charge it carried.
 *
 *   power = mptr->energy/999;        // unsigned division, truncates
 *   power = power * (rndm(.5)+.5);
 *   shieldhit(ptr,usrn,power);
 *
 * `mptr->energy` at this point has already been through ton_fact.
 *
 * @see GEFUNCS.C:1649-1651
 */
export function missileShieldDrain(
  rand: Random,
  charge: number,
  victimDamageFactor: number,
): number {
  const adjusted = Math.floor(charge * damageScale(victimDamageFactor));
  return Math.floor(Math.floor(adjusted / 999) * (rand.next() * 0.5 + 0.5));
}

/**
 * Flux drawn from the neutron pile to launch a missile of the given charge.
 *
 *   eng_flu = energy/misengfc;      // GECMDS.C:1278
 *
 * `energy` there is the charge argument (`unsigned`) and `misengfc` an `int`,
 * so this is C integer division and it TRUNCATES. The port was subtracting the
 * fractional quotient, which is not what a pilot is billed in the original.
 *
 * The truncation is load-bearing at the bottom of the range: with the shipped
 * `misengfc` of 100 (GE/REL/MBMGEMSG.MSG:349) any charge of 1..99 costs zero
 * flux, and the MISSHRT gate below is skipped entirely for it (`eng_flu > 0`).
 * A dry pile can still fling low-charge missiles forever. That is canon.
 *
 * @see GECMDS.C:1278
 */
export function missileFluxCost(charge: number, misengfc: number): number {
  if (misengfc <= 0) return 0;
  return Math.trunc(charge / misengfc);
}

/**
 * The MISSHRT gate: is the pile too shallow for this shot?
 *
 *   if (eng_flu > 0 && eng_flu >= (warsptr->energy+MOVENGMIN))   GECMDS.C:1280
 *
 * Note the PLUS. `energy` is a `double` (GEMAIN.H:334), so this is not an
 * overflow artefact — the shot is allowed to leave the pile up to MOVENGMIN-1
 * in the red, and `warsptr->energy -= eng_flu` at GECMDS.C:1312 duly takes it
 * there. Reading it as the more obvious `- MOVENGMIN` (keep a movement reserve)
 * would make missiles strictly harder to fire than the original allows, so the
 * `+` is reproduced verbatim. It is a leniency, not a defect: nothing wraps,
 * and the passive recharge climbs the pile back out.
 *
 * @see GECMDS.C:1280  @see GEMAIN.H:77 MOVENGMIN
 */
export function missileFluxShort(fluxCost: number, energy: number): boolean {
  return fluxCost > 0 && fluxCost >= energy + MOVENGMIN;
}

/**
 * The warp band at or above which crossing it shakes off every missile that is
 * tracking you — rolled fresh on each band crossing:
 *
 *   if ((ptr->speed + accelrate)/1000 >= (4 + gernd()%4))   GEFUNCS.C:506
 *
 * i.e. a uniform 4..7. On a hit, every `lmissl[i].distance` on the ACCELERATING
 * ship is zeroed and MISSL2 is printed to it ("The missile tracking us has lost
 * lockon and self destructed Sir!", GE/REL/MBMGEMSG.MSG:2630).
 *
 * This is a property of the acceleration path (GEFUNCS.C:499-522), not of the
 * missile command — the ship that escapes is the TARGET, and it escapes by
 * accelerating, not by firing. This helper is the canon roll for whoever wires
 * the acceleration step; it is not called from the weapon handlers.
 *
 * @see GEFUNCS.C:504-521
 */
export function missileShakeWarp(rand: Random): number {
  return 4 + Math.floor(rand.next() * 4);
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
 * Blast damage from a self-destructing ship to one neighbour.
 *
 *   ddist = 1.0-(ddist/DESTRUCTRANGE); if (ddist < 0) ddist = 0;
 *   ddist = ddist*ddist*ddist;
 *   damage = (unsigned)(ddist*minedammax);
 *   damage = damage*((ptr->shpclass/2)+1);
 *   if (SHIELDUP) damage = damage/(gernd()%5+wptr->shieldtype);
 *
 * @see GEFUNCS.C:1871-1893 destruct
 *
 * Deliberately NOT `mineFalloff`: the two look alike and scale by different
 * things. A mine's damage scales by the VICTIM's per-class damageFactor; a
 * scuttle scales by the class of the ship BLOWING UP, which is what makes
 * ramming a fight in a heavy hull worth doing.
 *
 * @param distanceRaw   cdistance * 10000, as canon compares it
 * @param destructClass ship class of the ship destroying itself
 * @param shieldUp      victim's shields raised
 * @param shieldType    victim's shield mark
 * @param roll          canon's `gernd()%5`, passed in so the caller owns the RNG
 */
export function destructBlastDamage(
  distanceRaw: number,
  destructClass: number,
  shieldUp: boolean,
  shieldType: number,
  roll: number,
): number {
  const linear = Math.max(0, 1 - distanceRaw / DESTRUCTRANGE);
  let damage = Math.floor(linear * linear * linear * MINEDAMMAX);
  // Integer division, as in C: class 5 gives (5/2)+1 = 3.
  damage *= Math.floor(destructClass / 2) + 1;
  if (shieldUp) {
    // C would divide by zero here for an unshielded-but-SHIELDUP ship; that
    // state cannot arise (shields cannot be raised without a generator), but
    // guard rather than emit Infinity.
    const divisor = roll + shieldType;
    damage = divisor > 0 ? Math.floor(damage / divisor) : damage;
  }
  return damage;
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
 * Roll for decoy intercept: a 1-in-`decodds` chance, matching C exactly.
 *
 * GEFUNCS.C:1585 (and :1670 for missiles) rolls `gernd() % decodds == 0`. This
 * port originally read `decodds` as a 0-100 percentage
 * (`rand * 100 < decodds`) — a different parameterisation of the same knob,
 * which meant the value could not be validated against the C clamp bounds of
 * 1..20 and had to be special-cased.
 *
 * The switch is behaviour-preserving: the old percentage default of 50 is
 * exactly `decodds = 2` here (1 in 2 = 50%).
 *
 * @see GEFUNCS.C:1585 torpedo decoy intercept
 * @see GEFUNCS.C:1670 missile decoy intercept
 */
export function decoyIntercept(rand: Random, decodds: number): boolean {
  if (decodds <= 0) return false;
  return Math.floor(rand.next() * decodds) === 0;
}

/**
 * Walk the decoy slots and roll `decoyIntercept` once for each LIVE decoy,
 * stopping at the first that succeeds.
 *
 * Returns the index of the slot that intercepted, or -1 if none did. The
 * caller is responsible for zeroing that slot — a decoy is spent when it works.
 *
 * Two things follow from C's loop that a single boolean test cannot express:
 * decoys stack (three deployed decoys get three rolls at the incoming round),
 * and each intercept costs one. The port used to test `hasActiveDecoy()` and
 * roll once, so a single decoy shrugged off every torpedo fired at it for its
 * whole 15-tick life and stacking bought nothing.
 *
 * @see GEFUNCS.C:1581-1592 torpedoes  @see GEFUNCS.C:1666-1677 missiles
 */
export function tryDecoyIntercept(rand: Random, decout: readonly number[], decodds: number): number {
  for (let j = 0; j < decout.length; j++) {
    if ((decout[j] ?? 0) <= 0) continue;
    if (decoyIntercept(rand, decodds)) return j;
  }
  return -1;
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
 * Human-readable damage description for status displays. Six bands, C's
 * wording:
 *
 *   < 2 "no" / < 12 "very light" / < 25 "light" / < 50 "moderate"
 *   / < 75 "heavy" / else "severe"
 *
 * The port had invented its own set, which called a ship at 95% hull damage
 * "Destroyed" while it was still flying and fighting, and had no band for a
 * scratch — anything under 10% read as undamaged, so you could not tell a
 * miss from a hit.
 *
 * @see GECMDS.C:2110-2131 damstr
 */
export function damstr(damagePct: number): string {
  if (damagePct < 2) return 'no';
  if (damagePct < 12) return 'very light';
  if (damagePct < 25) return 'light';
  if (damagePct < 50) return 'moderate';
  if (damagePct < 75) return 'heavy';
  return 'severe';
}


/**
 * firep's per-victim reachability gate.
 *
 *     if (ingegame(othusn) && (wptr->where != 1 || ptr->phasrtype >= phatowrp))
 *
 * (GECMDS.C:949.) A ship in hyperspace is untouchable unless the shooter
 * carries a Mark-`phatowrp` phaser or better — 5 in the shipped configuration.
 * This is what makes "jump to warp to break contact" work, and it is why
 * shields collapsing on hyperspace entry is survivable.
 *
 * The player's phaser handler enforced this; the droid and Cybertron paths did
 * not, so any AI with any phaser could shoot a player in transit, where shields
 * are down, `sca` is refused and nothing can be returned.
 *
 * Note it gates on `where`, the hyperspace FLAG, not on a speed threshold —
 * `victimAtWarp` in `phaserDamage` is a damage halving and not a permission.
 */
export function aiCanHitTarget(args: { phasrtype: number; targetWhere: number }): boolean {
  return args.targetWhere !== 1 || args.phasrtype >= PHATOWRP;
}
