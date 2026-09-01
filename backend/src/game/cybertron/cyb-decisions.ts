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
  return {
    desiredSpeed: distance > 0.5 ? 990.0 : rand.next() * 500.0,
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
 * @see GECYBS.C:2354 main loop spawn slot — picks class by population gap
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
 * Note the `- 1`: a CPU whose "User" column reads 6 pursues class 5 and up,
 * not class 6 and up. The port compared against the raw column and was one
 * class too strict — on top of reading the column off the wrong table.
 *
 * @see GECYBS.C:711, 719  @see reference/wiki/cpu-ships.md "User"
 */
export function canPursue(hunterLowestToAttack: number, victimClass: number): boolean {
  return hunterLowestToAttack - 1 <= victimClass;
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
