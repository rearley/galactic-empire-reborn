/**
 * T040 — Statistical annoy rate: rollAnnoy(4, rng) over 100 trials with seeded PRNG
 * must produce between 15 and 35 successes (≈25% rate, SC-002).
 *
 * Each trial uses a fresh Mulberry32Adapter seeded with the trial index,
 * replicating how the existing droid-decisions.spec.ts validates the rate.
 *
 * @see GEDROIDS.C:237 droid_annoy — if ((gernd()%rnd) == 1)
 * @see specs/008-droid-ai/tasks.md T040
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { rollAnnoy } from '../../../src/game/droid/droid-decisions';
import { DROID_ANNOY_DENOM } from '../../../src/game/constants';

describe('T040 — annoy rate statistic (SC-002 ~25% over 100 trials)', () => {
  it('rollAnnoy(DROID_ANNOY_DENOM=4, rng) produces 15–35 successes in 100 trials', () => {
    // Each trial uses a fresh seeded PRNG to replicate independent roll evaluations.
    let count = 0;
    const rng = new Mulberry32Adapter(42);

    for (let i = 0; i < 100; i++) {
      if (rollAnnoy(DROID_ANNOY_DENOM, rng)) {
        count++;
      }
    }

    expect(count).toBeGreaterThanOrEqual(15);
    expect(count).toBeLessThanOrEqual(35);
  });

  it('DROID_ANNOY_DENOM constant is 4', () => {
    expect(DROID_ANNOY_DENOM).toBe(4);
  });

  it('rate is consistent across different seeds (all within 15–35 per 100 trials)', () => {
    // Validate the rate holds for multiple distinct seeds
    for (const seed of [1, 7, 42, 100, 999]) {
      const rng = new Mulberry32Adapter(seed);
      let successes = 0;
      for (let i = 0; i < 100; i++) {
        if (rollAnnoy(DROID_ANNOY_DENOM, rng)) successes++;
      }
      expect(successes).toBeGreaterThanOrEqual(15);
      expect(successes).toBeLessThanOrEqual(35);
    }
  });

  it('using one fresh RNG per trial also satisfies the 15–35 bound', () => {
    // Alternative approach: one seeded instance per trial (as used in droid-decisions.spec.ts)
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const rng = new Mulberry32Adapter(i);
      if (rollAnnoy(DROID_ANNOY_DENOM, rng)) {
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(15);
    expect(count).toBeLessThanOrEqual(35);
  });
});
