import { DECOYTIME, MAXDECOY,
  CYB_ALLOW,
  CYB_MAXCASH,
} from '../constants';
import type { Random } from '../combat/random.port';
import type { CybertronClassConfig } from './cybertron.config';

/**
 * Pure decision functions for Cybertron AI — no NestJS imports, no side effects.
 * All randomness flows through the injected Random port for test determinism.
 *
 * @see GECYBS.C — cybwhoops, gebemean, cyb_check_lockon, cyb_attack, cyb_init
 * @see specs/007-cybertron-ai/plan.md R-5 (Random port reuse)
 */

/** Result of pickPursuitBand: what the Cybertron should do this tick. */
export interface PursuitBand {
  desiredSpeed: number;
  /** 1 = enter/stay in hyperspace; 0 = normal space */
  where: number;
  /** Shield value to set (0 in hyperwarp, class max on drop-out, undefined = no change) */
  shield: number | undefined;
  /** True when Cybertron is dropping from hyperwarp back to normal space */
  raiseShields: boolean;
  /** Instantaneous `ptr->speed = ptr->speed2b` (hyperwarp band only). */
  speed?: number;
  /** Instantaneous `if (ptr->speed > X) ptr->speed = X` ceiling for this band. */
  speedClamp?: number;
}

/** Loadout assigned at Cybertron spawn. @see GECYBS.C:164-172 cyb_init */
export interface CybertronLoadout {
  fluxpod: number;
  decoys: number;
  torpedo: number;
  mine: number;
  jammers: number;
  gold: number;
}

/**
 * Roll a "whoops" (skill error) for this Cybertron.
 * Returns true if the AI makes an error this action (suppresses weapon fire, decoys, etc).
 * @see GECYBS.C:410 cybwhoops — 1-in-cybskill roll
 */
export function cybwhoops(cybskill: number, rand: Random): boolean {
  return Math.floor(rand.next() * cybskill) === 1;
}

/**
 * Determine whether the Cybertron acts with full aggression this tick.
 * Cyberquads (tough=CYB_TOUGH_1) are always mean. Otherwise depends on target kills and 1-in-CYBSLO roll.
 * @see GECYBS.C:432 gebemean
 */
export function gebemean(
  cybTough: number,
  targetKills: number,
  cybBeNice: number,
  cybSlo: number,
  rand: Random,
): boolean {
  // Cyberquads are ALWAYS mean
  if (cybTough === 1) return true;
  // Player accumulated enough kills — always mean
  if (targetKills > cybBeNice) return true;
  // 1-in-CYBSLO random chance
  return Math.floor(rand.next() * cybSlo) === 0;
}

/**
 * Determine torpedo volley size based on difficulty and class capability.
 * @see GECYBS.C:527-543 cyb_attack — j = gernd()%6 (quad/hard) or gernd()%2 (easy)
 */
export function rollTorpedoCount(
  cybTough: number,
  targetKills: number,
  classHasTorpedo: boolean,
  gebemeanResult: boolean,
  cybBeEasy: number,
  rand: Random,
): number {
  if (!classHasTorpedo) return 0;
  if (!gebemeanResult) return 0;
  // Cyberquad OR target has ≥ CYB_BE_EASY kills → full volley (rnd%6)
  if (cybTough === 1 || targetKills >= cybBeEasy) {
    return Math.floor(rand.next() * 6);
  }
  // Ordinary Cybertron, target hasn't accumulated many kills → small volley (rnd%2)
  return Math.floor(rand.next() * 2);
}

/**
 * Select pursuit speed band based on distance to target.
 * Returns the desired speed, where flag, and shield adjustments.
 * @see GECYBS.C:742-801 cyb_check_lockon — four-band selection
 */
export function pickPursuitBand(
  distance: number,
  hyperdist1: number,
  hyperdist2: number,
  currentWhere: number,
  classMaxShields: number,
  topSpeed: number,
  rand: Random,
  /**
   * The target's own motion. Canon's combat band reads `wptr->where` and
   * `wptr->speed2b` to decide whether it is chasing or closing.
   * @see GECYBS.C:793-796
   */
  target: { where: number; speed2b: number },
): PursuitBand {
  if (distance >= hyperdist1) {
    // Hyperwarp band — 20x speed, shields down. C snaps `ptr->speed` straight
    // to speed2b here rather than accelerating into it. @see GECYBS.C:745-746
    const desiredSpeed = distance * 2000.0;
    return {
      desiredSpeed,
      speed: desiredSpeed,
      where: 1,
      shield: 0,
      raiseShields: false,
    };
  }
  if (distance >= hyperdist2) {
    // Brake band — `if (ptr->speed > 20000.0) ptr->speed = 20000.0`, then head
    // toward the target at top speed. C raises no shields in this band.
    // @see GECYBS.C:756-769
    return {
      desiredSpeed: topSpeed,
      speedClamp: 20000,
      where: 0,
      shield: currentWhere === 1 ? classMaxShields : undefined,
      raiseShields: false,
    };
  }
  if (distance > 3.0) {
    // Close band — top speed toward target, shields up. C gates the shieldup on
    // `ptr->where == 0`: a Cybertron closing in NORMAL space puts them up. The
    // port had `currentWhere === 1`, so they only went up on the single tick it
    // dropped out of hyperwarp and the Cybertron fought bare-hulled.
    // @see GECYBS.C:774-784
    return {
      desiredSpeed: topSpeed,
      speedClamp: topSpeed,
      where: 0,
      shield: currentWhere === 1 ? classMaxShields : undefined,
      raiseShields: currentWhere === 0,
    };
  }
  // Combat band — distance <= 3.0; @see GECYBS.C:789-803
  //
  //   if (wptr->where == 1)
  //       ptr->speed2b = ((wptr->speed2b > d_topspeed) ? d_topspeed : (wptr->speed2b*1.25));
  //   else
  //       ptr->speed2b = ((low_dist > .5) ? 990.0 : rndm(500.0));
  //
  // The port had only the `else`, so a Cybertron in contact crawled at a flat
  // 990 whatever the target did — and a player at warp is `where == 1` moving
  // thousands of units a tick, so running away always worked. The 1.25 makes
  // the pursuer a quarter faster than its prey, bounded by its own top speed;
  // that bound is what keeps a slow hull from teleporting after a fast one.
  const chasingIntoHyperspace = target.where === 1;
  const desiredSpeed = chasingIntoHyperspace
    ? Math.min(target.speed2b * 1.25, topSpeed)
    : distance > 0.5
      ? 990.0
      : rand.next() * 500.0;
  return {
    desiredSpeed,
    speedClamp: topSpeed,
    where: 0,
    shield: currentWhere === 1 ? classMaxShields : undefined,
    raiseShields: currentWhere === 0,
  };
}

/**
 * Pick a spawn class for a new Cybertron slot.
 * 1% chance of a random CPU_COMBATIVE class regardless of population; otherwise picks
 * among classes that still have room up to tot_to_create.
 * @see GEMAIN.C:2354 main loop spawn slot — picks class by population gap
 *      (cited as GECYBS.C until 2026-09-10; the line number was always right,
 *      the filename was not — GECYBS.C is 839 lines long)
 */
export function pickSpawnClass(
  classCounts: Map<number, number>,
  configs: Record<number, CybertronClassConfig>,
  rand: Random,
): number | null {
  const classNumbers = Object.keys(configs).map(Number);
  // 1% random-class branch (regardless of fill state)
  if (rand.next() < 0.01) {
    return classNumbers[Math.floor(rand.next() * classNumbers.length)];
  }
  // Normal: pick from classes below their population cap
  const eligible = classNumbers.filter((n) => (classCounts.get(n) ?? 0) < configs[n].tot_to_create);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rand.next() * eligible.length)];
}

/**
 * Build an initial loadout for a newly-spawned Cybertron.
 * @see GECYBS.C:164-172 cyb_init — items array initialization
 */
export function randomInitLoadout(cybGold: number, rand: Random): CybertronLoadout {
  return {
    fluxpod: Math.floor(rand.next() * 5),
    decoys: Math.floor(rand.next() * 25),
    torpedo: Math.floor(rand.next() * 25),
    mine: Math.floor(rand.next() * 100),
    jammers: Math.floor(rand.next() * 100),
    gold: Math.floor(rand.next() * cybGold),
  };
}

/**
 * Randomize cybskill in [3, 17] at spawn.
 * @see GECYBS.C:175 ptr->cybskill = (byte)gernd()%15+3
 */
export function randomCybSkill(rand: Random): number {
  return Math.floor(rand.next() * 15) + 3;
}


/**
 * `cyb_lay_decoys` — fill every empty decoy slot, up to the first five.
 *
 * C: `for (i=0; i<5; ++i) if (ptr->decout[i] == 0) ptr->decout[i] = DECOYTIME;`
 * All five, not one, and at no inventory cost — a Cybertron's decoys are part
 * of the class, not cargo. The port filled a single slot and decremented
 * I_DECOY, and since `decout` was `[]` at spawn the `findIndex` returned -1 and
 * it bailed out for the ship's entire life.
 *
 * @see GECYBS.C:606-612
 */
/** C fills only the first five decoy slots. @see GECYBS.C:609 `for (i=0; i<5; ++i)` */
const CYB_DECOY_SLOTS = 5;

export function layDecoys(decout: readonly number[]): number[] {
  const next = [...decout];
  while (next.length < MAXDECOY) next.push(0);
  for (let i = 0; i < CYB_DECOY_SLOTS; i++) {
    if (next[i] === 0) next[i] = DECOYTIME;
  }
  return next;
}

/** What a Cybertron does after its weapon volleys. @see GECYBS.C:541-585 */
export interface CybEvasion {
  /** Sweep the minefield — `ptr->items[I_ZIPPERS] = 1; zip(ptr,usrn);` */
  fireZipper: boolean;
  /** `ptr->minesnear = FALSE` after a successful sweep. */
  clearMinesnear: boolean;
  /** New `speed2b`, if this pass changed it. */
  speed2b?: number;
  /** New `head2b` in degrees, if this pass scrambled the course. */
  head2b?: number;
  /** New `holdcourse` counter, if set. */
  holdcourse?: number;
  /** `shieldup(ptr,usrn)` — only when fighting in normal space. */
  raiseShields: boolean;
}

export interface CybEvasionInput {
  hasZipper: boolean;
  minesnear: boolean;
  where: number;
  hasIncomingMissile: boolean;
  topSpeed: number;
}

/**
 * The tail of `cyb_attack`: mine evasion, attack-vector scrambling, hyperspace
 * missile evasion, and the shield raise.
 *
 * Three things the port lost by hoisting a simplified zipper branch up into the
 * engagement scan: the 1-in-10 and 1-in-3 gates (it swept on any `minesnear`),
 * the random flight heading (it reversed by exactly 180 degrees, which is
 * predictable), and the fact that C keeps evaluating afterwards rather than
 * returning out of the scan.
 *
 * @see GECYBS.C:541-585
 */
export function decideCybEvasion(input: CybEvasionInput, rand: Random): CybEvasion {
  const { hasZipper, minesnear, where, hasIncomingMissile, topSpeed } = input;
  const out: CybEvasion = { fireZipper: false, clearMinesnear: false, raiseShields: false };

  // Zippers — `if (gernd()%10 == 1 && has_zip)`
  if (Math.floor(rand.next() * 10) === 1 && hasZipper) {
    if (minesnear) {
      if (Math.floor(rand.next() * 3) === 1) {
        out.fireZipper = true;
        out.clearMinesnear = true;
      }
      // The retreat happens whether or not the sweep roll landed.
      out.speed2b = topSpeed;
      out.head2b = rand.next() * 359.9;
      out.holdcourse = Math.floor(rand.next() * 20) + 3;
    }
  }

  // `if (gernd()%20 == 1)` — scramble the attack vector to stay unpredictable.
  if (Math.floor(rand.next() * 20) === 1) {
    out.speed2b = topSpeed;
    out.head2b = rand.next() * 359.9;
    out.holdcourse = Math.floor(rand.next() * 10) + 3;
  }

  if (where === 1) {
    // Fighting in hyperspace with a missile inbound: break speed and hold.
    if (hasIncomingMissile) {
      out.speed2b = rand.next() * 5000 + 4500;
      out.holdcourse = Math.floor(rand.next() * 5) + 5;
    }
  } else {
    out.raiseShields = true;
  }

  return out;
}


/**
 * May a Cybertron of this class pursue a player of that class unprovoked?
 *
 *   lta = shipclass[hunter].lowest_to_attk - 1;
 *   if (lta <= wptr->shpclass) ...
 *
 * C's `- 1` is an INDEX-BASIS CONVERSION, not part of the rule. `wptr->shpclass`
 * is a 0-based index into shipclass[]: GEMAIN.C:898 increments `i` once per
 * class block, GECMDS.C:412 prints `i+1` as the class number a player sees, and
 * GECMDS.C:4562 parses a typed class with `atoi(margv[2])-1`. Our `shpclass` is
 * the 1-based classNumber straight from the seed, so subtracting one here
 * repeats a conversion already made and pursues one class too low.
 *
 * The visible case is the Sarten Obliterator, LATK 3. Canon starts it at
 * display class 3, the Heavy Freighter. Ours pursued class 2, the Stealth
 * Fighter -- the ship a player upgrades into straight after the Interceptor.
 * Class 23's LATK of 20 lands the same in either basis, which is why only one
 * class showed the symptom while every future LATK inherited the fault.
 *
 * @see GECYBS.C:711, 719
 * @see GEMAIN.C:898, GECMDS.C:412, GECMDS.C:4562 — the 0-based basis
 */
export function canPursue(hunterLowestToAttack: number, victimClass: number): boolean {
  return hunterLowestToAttack <= victimClass;
}

/**
 * May another Cybertron claim this victim, given how many already have?
 *
 *   return (nc < shipclass[victim].noclaim);
 *
 * The limit belongs to the PREY — the wiki's "Cyb#" column, "how many
 * combative CPU ships will pursue this ship simultaneously". A Cyb# of 0
 * therefore means never claimable unprovoked, which is how the Heavy Freighter
 * and Freight Barge are protected; the port treated 0 as "no limit" and read
 * the column off the attacking Cybertron.
 *
 * @see GECYBS.C:357-376  @see reference/wiki/player-ships.md "Cyb#"
 */
export function notClaimed(existingClaims: number, victimNoClaim: number): boolean {
  return existingClaims < victimNoClaim;
}


/**
 * Credit one tick's allowance to a Cybertron's purse.
 *
 * `warusroff(usrn)->cash += CYB_ALLOW;` on every `cyb_lives` pass, with the
 * balance clamped to CYB_MAXCASH. This is what makes a long-lived Cybertron a
 * worthwhile target — the port credited `energy` instead, and then overwrote
 * energy with a flat value, so the allowance vanished and every Cybertron was
 * worth the same as a fresh spawn.
 *
 * @see GECYBS.C:228-229  @see GECYBS.C:121-122 the CYB_MAXCASH clamp
 */
export function creditAllowance(cash: bigint): bigint {
  const next = cash + BigInt(CYB_ALLOW);
  const cap = BigInt(CYB_MAXCASH);
  return next > cap ? cap : next;
}


/**
 * `cyb_annoy`'s `rnd` argument. Both call sites pass 20 — the engaging branch
 * (GECYBS.C:295) and the shadowing branch (GECYBS.C:300).
 */
export const CYB_ANNOY_ODDS = 20;

/**
 * Does the Cybertron say something this pass?
 *
 *   if ((gernd()%rnd) == 1) { ... prfmsg(sel, ptr->shipname); }
 *
 * Note it is `== 1`, not `== 0` — one specific bucket of the twenty. The port
 * had no gate at all and taunted on every pass; with the taunt now reaching
 * the targeted pilot rather than the attacker's sector room, that would bury
 * the game's only early warning in noise.
 *
 * @see GECYBS.C:391
 */
export function shouldTaunt(rand: Random, odds: number): boolean {
  return Math.floor(rand.next() * odds) === 1;
}


/**
 * Is this AI ship's owner a Cybertron with a User row to credit?
 *
 * `CybertronTickService` walks every `status === GESTAT_AUTO` ship, and that
 * includes droids — they are AI too. Droids are ephemeral (no DB row, no User
 * record), so crediting them CYB_ALLOW threw "Record to update not found" on
 * every flush.
 *
 * C never hits this: `cyb_lives` is only reached through the per-class
 * `tick_func` table (GEMAIN.C:2418), so a droid runs `droid_lives` and never
 * touches the allowance line at GECYBS.C:229.
 */
export function creditsAreOwed(userid: string): boolean {
  return userid.startsWith('Cybrg-');
}


/**
 * The kill count the escalation gates read.
 *
 * Canon reads the USER record on both — `warusroff(usrn)->kills > CYB_BE_NICE`
 * (GECYBS.C:441) and `warusroff(zothusn)->kills < CYB_BE_EASY` (:524) — not the
 * ship's. The port passed `ship.kills`, which resets on every new hull, so a
 * counter that has to reach 30 and then 60 was wiped every time a player died.
 *
 * Falls back to the hull count only when there is no captain behind it: AI
 * ships have no User row, and `Ship.kills` is the only counter they have.
 */
export function escalationKills(ship: { kills: number; userKills?: number }): number {
  return ship.userKills ?? ship.kills;
}
