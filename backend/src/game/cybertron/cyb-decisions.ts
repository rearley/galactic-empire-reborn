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
    // Hyperwarp band — 20× speed, shields down
    return {
      desiredSpeed: distance * 2000.0,
      where: 1,
      shield: 0,
      raiseShields: false,
    };
  }
  if (distance >= hyperdist2) {
    // Brake band — cap speed, head toward target at top speed
    return {
      desiredSpeed: topSpeed,
      where: 0,
      shield: currentWhere === 1 ? classMaxShields : undefined,
      raiseShields: currentWhere === 1,
    };
  }
  if (distance > 3.0) {
    // Close band — top speed toward target, raise shields
    return {
      desiredSpeed: topSpeed,
      where: 0,
      shield: currentWhere === 1 ? classMaxShields : undefined,
      raiseShields: currentWhere === 1,
    };
  }
  // Combat band — distance ≤ 3.0; @see GECYBS.C:797 speed2b = (low_dist > .5) ? 990.0 : rndm(500.0)
  return {
    desiredSpeed: distance > 0.5 ? 990.0 : rand.next() * 500.0,
    where: 0,
    shield: currentWhere === 1 ? classMaxShields : undefined,
    raiseShields: currentWhere === 1,
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
