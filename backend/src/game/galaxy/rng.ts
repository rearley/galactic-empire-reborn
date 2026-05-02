/**
 * Mulberry32 pseudo-random number generator.
 *
 * Used for all procedural generation in the galaxy (sector layout, planet
 * placement, wormhole pairing, etc.). A seeded PRNG ensures the galaxy can
 * be reproduced deterministically from the same seed.
 *
 * The original game used a simple LCG via the C runtime `rand()`. Mulberry32
 * is a higher-quality 32-bit PRNG with similar speed and a well-defined,
 * platform-independent output sequence.
 *
 * @see GEFUNCS.C:gernd
 */
export class Rng {
  /** Current state (uint32). Advanced on every call to {@link next}. */
  private state: number;

  /**
   * Create a new Rng instance.
   *
   * @param seed - Arbitrary integer seed. Truncated to uint32 via `>>> 0`.
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Advance the state and return the next float in [0, 1).
   *
   * Implements the Mulberry32 algorithm:
   * ```
   * a |= 0; a = a + 0x6D2B79F5 | 0;
   * let t = Math.imul(a ^ a >>> 15, 1 | a);
   * t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
   * return ((t ^ t >>> 14) >>> 0) / 4294967296;
   * ```
   *
   * @returns Float ∈ [0, 1).
   * @see GEFUNCS.C:gernd
   */
  next(): number {
    let a = this.state;
    a = (a + 0x6d2b79f5) | 0;
    this.state = a;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Return a random integer in the range `[0, max)`.
   *
   * @param max - Exclusive upper bound (must be > 0).
   * @returns Integer ∈ [0, max − 1].
   * @see GEFUNCS.C:gernd
   */
  intBelow(max: number): number {
    return Math.floor(this.next() * max);
  }
}
