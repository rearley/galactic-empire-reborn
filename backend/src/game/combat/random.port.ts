/**
 * Injectable PRNG port — never use Math.random() inline in combat code.
 * Tests inject a seeded Mulberry32 instance for deterministic behavior.
 *
 * @see specs/006b-combat/research.md R-2, SC-004
 */
export interface Random {
  /** Returns a uniform pseudo-random number in [0, 1). */
  next(): number;
}

/**
 * Simulates gernd() from the original game — returns an integer in [0, 65535].
 * Used for modulo-based probability gates (e.g. gernd() % 35).
 * @see GEMAIN.H — gernd() macro / PRNG
 */
export function gernd(random: Random): number {
  return Math.floor(random.next() * 65536);
}

/**
 * rndm(n) — returns a uniform float in [0, n).
 * Used for proportional damage calculations (e.g. rndm(plattrt1) + 0.25).
 * @see research.md D5
 * @see GECMDS.C:3605 (troop ground kill)
 */
export function rndm(random: Random, n: number): number {
  return random.next() * n;
}

/** DI token for the Random port. */
export const RANDOM = 'RANDOM';

/** Production adapter — wraps Math.random(). */
export class MathRandomAdapter implements Random {
  next(): number {
    return Math.random();
  }
}

/**
 * Mulberry32 seeded PRNG — deterministic for tests.
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 * @see specs/006b-combat/research.md R-2, SC-004
 */
export class Mulberry32Adapter implements Random {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }
}
