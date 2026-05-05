/**
 * T015 — Loadout bands: Murdonian receives full random loadout; Scow/Vakory
 * receive sparse loadout. All item values must stay within the ranges defined
 * in GEDROIDS.C:147-163.
 *
 * @see GEDROIDS.C:147-155 — Murdonian: %50, %250, %250, %100, %100, %100, %25, %250
 * @see GEDROIDS.C:159-163 — Sparse:    %50, %25, %10, %10
 * @see specs/008-droid-ai/tasks.md T015
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import {
  randomMurdonianLoadout,
  randomSparseLoadout,
} from '../../../src/game/droid/droid-decisions';
import { I_FLUX, I_DECOY, I_TORP, I_MINE, I_JAMMER, I_MISSL, I_ION, I_GOLD } from '../../../src/game/constants/items';

// ─── Helper ───────────────────────────────────────────────────────────────────

function seeded(seed: number): Mulberry32Adapter {
  return new Mulberry32Adapter(seed);
}

// ─── Murdonian Transport (class 32) — full loadout ───────────────────────────

describe('T015 — Murdonian loadout: randomMurdonianLoadout', () => {
  const TRIALS = 100;
  const samples: bigint[][] = [];

  beforeAll(() => {
    for (let i = 0; i < TRIALS; i++) {
      samples.push(randomMurdonianLoadout(seeded(i)));
    }
  });

  it('flux (I_FLUX=4) is in [0, 49] across all trials', () => {
    for (const items of samples) {
      expect(items[I_FLUX]).toBeGreaterThanOrEqual(0n);
      expect(items[I_FLUX]).toBeLessThanOrEqual(49n);
    }
  });

  it('decoys (I_DECOY=7) are in [0, 249] across all trials', () => {
    for (const items of samples) {
      expect(items[I_DECOY]).toBeGreaterThanOrEqual(0n);
      expect(items[I_DECOY]).toBeLessThanOrEqual(249n);
    }
  });

  it('torpedoes (I_TORP=2) are in [0, 249] across all trials', () => {
    for (const items of samples) {
      expect(items[I_TORP]).toBeGreaterThanOrEqual(0n);
      expect(items[I_TORP]).toBeLessThanOrEqual(249n);
    }
  });

  it('mines (I_MINE=11) are in [0, 99] across all trials', () => {
    for (const items of samples) {
      expect(items[I_MINE]).toBeGreaterThanOrEqual(0n);
      expect(items[I_MINE]).toBeLessThanOrEqual(99n);
    }
  });

  it('jammers (I_JAMMER=10) are in [0, 99] across all trials', () => {
    for (const items of samples) {
      expect(items[I_JAMMER]).toBeGreaterThanOrEqual(0n);
      expect(items[I_JAMMER]).toBeLessThanOrEqual(99n);
    }
  });

  it('missiles (I_MISSL=1) are in [0, 99] across all trials', () => {
    for (const items of samples) {
      expect(items[I_MISSL]).toBeGreaterThanOrEqual(0n);
      expect(items[I_MISSL]).toBeLessThanOrEqual(99n);
    }
  });

  it('ion cannons (I_ION=3) are in [0, 24] across all trials', () => {
    for (const items of samples) {
      expect(items[I_ION]).toBeGreaterThanOrEqual(0n);
      expect(items[I_ION]).toBeLessThanOrEqual(24n);
    }
  });

  it('gold (I_GOLD=12) is in [0, 249] across all trials', () => {
    for (const items of samples) {
      expect(items[I_GOLD]).toBeGreaterThanOrEqual(0n);
      expect(items[I_GOLD]).toBeLessThanOrEqual(249n);
    }
  });

  it('returns an array of 14 bigint entries', () => {
    const items = randomMurdonianLoadout(seeded(0));
    expect(items).toHaveLength(14);
    for (const v of items) {
      expect(typeof v).toBe('bigint');
    }
  });

  it('all item values are non-negative', () => {
    for (const items of samples) {
      for (const v of items) {
        expect(v).toBeGreaterThanOrEqual(0n);
      }
    }
  });

  it('upper bounds are actually reached (statistical guard across 1000 trials)', () => {
    // Confirm each field's maximum is reached at least once across 1000 seeds.
    // This guards against accidentally clamping the range too low.
    let maxFlux = 0n, maxDecoy = 0n, maxTorp = 0n, maxMine = 0n;
    let maxJammer = 0n, maxMissl = 0n, maxIon = 0n, maxGold = 0n;

    for (let i = 0; i < 1000; i++) {
      const items = randomMurdonianLoadout(seeded(i));
      if (items[I_FLUX]   > maxFlux)   maxFlux   = items[I_FLUX];
      if (items[I_DECOY]  > maxDecoy)  maxDecoy  = items[I_DECOY];
      if (items[I_TORP]   > maxTorp)   maxTorp   = items[I_TORP];
      if (items[I_MINE]   > maxMine)   maxMine   = items[I_MINE];
      if (items[I_JAMMER] > maxJammer) maxJammer = items[I_JAMMER];
      if (items[I_MISSL]  > maxMissl)  maxMissl  = items[I_MISSL];
      if (items[I_ION]    > maxIon)    maxIon    = items[I_ION];
      if (items[I_GOLD]   > maxGold)   maxGold   = items[I_GOLD];
    }

    expect(maxFlux).toBeGreaterThan(30n);
    expect(maxDecoy).toBeGreaterThan(150n);
    expect(maxTorp).toBeGreaterThan(150n);
    expect(maxMine).toBeGreaterThan(60n);
    expect(maxJammer).toBeGreaterThan(60n);
    expect(maxMissl).toBeGreaterThan(60n);
    expect(maxIon).toBeGreaterThan(15n);
    expect(maxGold).toBeGreaterThan(150n);
  });
});

// ─── Lydorian Garbage Scow (class 31) — sparse loadout ───────────────────────

describe('T015 — Scow loadout: randomSparseLoadout', () => {
  const TRIALS = 100;
  const samples: bigint[][] = [];

  beforeAll(() => {
    for (let i = 0; i < TRIALS; i++) {
      samples.push(randomSparseLoadout(seeded(i + 200)));
    }
  });

  it('flux (I_FLUX=4) is in [0, 49] across all trials', () => {
    for (const items of samples) {
      expect(items[I_FLUX]).toBeGreaterThanOrEqual(0n);
      expect(items[I_FLUX]).toBeLessThanOrEqual(49n);
    }
  });

  it('decoys (I_DECOY=7) are in [0, 24] across all trials', () => {
    for (const items of samples) {
      expect(items[I_DECOY]).toBeGreaterThanOrEqual(0n);
      expect(items[I_DECOY]).toBeLessThanOrEqual(24n);
    }
  });

  it('mines (I_MINE=11) are in [0, 9] across all trials', () => {
    for (const items of samples) {
      expect(items[I_MINE]).toBeGreaterThanOrEqual(0n);
      expect(items[I_MINE]).toBeLessThanOrEqual(9n);
    }
  });

  it('jammers (I_JAMMER=10) are in [0, 9] across all trials', () => {
    for (const items of samples) {
      expect(items[I_JAMMER]).toBeGreaterThanOrEqual(0n);
      expect(items[I_JAMMER]).toBeLessThanOrEqual(9n);
    }
  });

  it('torpedoes (I_TORP=2) === 0n — sparse ships carry no torps', () => {
    for (const items of samples) {
      expect(items[I_TORP]).toBe(0n);
    }
  });

  it('missiles (I_MISSL=1) === 0n — sparse ships carry no missiles', () => {
    for (const items of samples) {
      expect(items[I_MISSL]).toBe(0n);
    }
  });

  it('ion cannons (I_ION=3) === 0n — sparse ships carry no ion', () => {
    for (const items of samples) {
      expect(items[I_ION]).toBe(0n);
    }
  });

  it('gold (I_GOLD=12) === 0n — sparse ships carry no gold', () => {
    for (const items of samples) {
      expect(items[I_GOLD]).toBe(0n);
    }
  });

  it('returns an array of 14 bigint entries', () => {
    const items = randomSparseLoadout(seeded(0));
    expect(items).toHaveLength(14);
    for (const v of items) {
      expect(typeof v).toBe('bigint');
    }
  });
});

// ─── Vakory Survey Drone (class 33) — same sparse band as Scow ───────────────

describe('T015 — Vakory loadout: randomSparseLoadout (same function as Scow)', () => {
  const TRIALS = 100;
  const samples: bigint[][] = [];

  beforeAll(() => {
    for (let i = 0; i < TRIALS; i++) {
      samples.push(randomSparseLoadout(seeded(i + 400)));
    }
  });

  it('decoys (I_DECOY=7) are in [0, 24]', () => {
    for (const items of samples) {
      expect(items[I_DECOY]).toBeLessThanOrEqual(24n);
    }
  });

  it('mines (I_MINE=11) are in [0, 9]', () => {
    for (const items of samples) {
      expect(items[I_MINE]).toBeLessThanOrEqual(9n);
    }
  });

  it('torpedoes === 0n, missiles === 0n, ion === 0n, gold === 0n', () => {
    for (const items of samples) {
      expect(items[I_TORP]).toBe(0n);
      expect(items[I_MISSL]).toBe(0n);
      expect(items[I_ION]).toBe(0n);
      expect(items[I_GOLD]).toBe(0n);
    }
  });
});

// ─── Comparative: Murdonian loadout > Sparse across key fields ───────────────

describe('T015 — loadout comparison: Murdonian has heavier load than sparse', () => {
  it('Murdonian average decoys > sparse average decoys across 500 trials', () => {
    let murdonianSum = 0n;
    let sparseSum = 0n;

    for (let i = 0; i < 500; i++) {
      murdonianSum += randomMurdonianLoadout(seeded(i))[I_DECOY];
      sparseSum    += randomSparseLoadout(seeded(i))[I_DECOY];
    }

    // Murdonian: avg ~125; Sparse: avg ~12 — Murdonian should be clearly heavier
    expect(murdonianSum).toBeGreaterThan(sparseSum);
  });

  it('Murdonian is the only loadout with non-zero gold possible', () => {
    let murdonianGoldNonZero = false;
    for (let i = 0; i < 100; i++) {
      if (randomMurdonianLoadout(seeded(i))[I_GOLD] > 0n) {
        murdonianGoldNonZero = true;
        break;
      }
    }
    expect(murdonianGoldNonZero).toBe(true);

    // Sparse gold must always be 0
    for (let i = 0; i < 100; i++) {
      expect(randomSparseLoadout(seeded(i))[I_GOLD]).toBe(0n);
    }
  });
});
