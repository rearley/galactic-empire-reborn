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
