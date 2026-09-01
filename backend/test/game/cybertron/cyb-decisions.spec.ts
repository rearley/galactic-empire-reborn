/**
 * Unit tests for pure decision functions in cyb-decisions.ts.
 * All randomness uses the seeded Mulberry32 PRNG for determinism.
 *
 * @see GECYBS.C — cybwhoops, gebemean, cyb_attack, cyb_init
 * @see specs/007-cybertron-ai/tasks.md T013, T014, T033, T034
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import {
  cybwhoops,
  gebemean,
  rollTorpedoCount,
  pickPursuitBand,
  pickSpawnClass,
  randomInitLoadout,
  randomCybSkill,
} from '../../../src/game/cybertron/cyb-decisions';
import { CYBERTRON_CLASS_DEFAULTS } from '../../../src/game/cybertron/cybertron.config';
import {
  CYB_BE_NICE,
  CYB_BE_EASY,
  CYBSLO,
  CYB_TOUGH_0,
  CYB_TOUGH_1,
} from '../../../src/game/constants';

function seeded(seed: number): Mulberry32Adapter {
  return new Mulberry32Adapter(seed);
}

// ─── T013: pickSpawnClass + randomInitLoadout ──────────────────────────────

describe('pickSpawnClass (T013)', () => {
  it('returns null when all classes are at capacity', () => {
    const counts = new Map([[21, 10], [22, 5], [23, 1], [24, 6], [25, 2]]);
    // Use a seeded RNG that won't hit the 1% random branch
    const rand = seeded(0x00000001);
    // We call 1000 times; all should return null (only 1% branch could fire but pick an "over-cap" class)
    let nonNulls = 0;
    for (let i = 0; i < 1000; i++) {
      const r = pickSpawnClass(counts, CYBERTRON_CLASS_DEFAULTS, new Mulberry32Adapter(i));
      if (r !== null) nonNulls++;
    }
    // 1% random-class branch can return any class even at cap, so ~10 of 1000 might be non-null
    expect(nonNulls).toBeLessThanOrEqual(30); // allow some variance
  });

  it('returns a class below capacity when one exists', () => {
    const counts = new Map([[21, 10], [22, 3], [23, 1], [24, 6], [25, 2]]); // class 22 has room
    const rand = seeded(42); // seed that avoids 1% branch
    // Run multiple times to get the normal branch
    let found: number | null = null;
    for (let i = 0; i < 100 && found === null; i++) {
      const r = pickSpawnClass(counts, CYBERTRON_CLASS_DEFAULTS, new Mulberry32Adapter(i * 7 + 100));
      if (r !== null && (counts.get(r) ?? 0) < CYBERTRON_CLASS_DEFAULTS[r].tot_to_create) {
        found = r;
      }
    }
    expect(found).toBe(22);
  });

  it('1% random-class branch fires approximately 1% of the time', () => {
    const counts = new Map([[21, 10], [22, 5], [23, 1], [24, 6], [25, 2]]); // all at cap
    // Count how often we get non-null (all from random branch since caps are full)
    let fires = 0;
    for (let i = 0; i < 10000; i++) {
      const r = pickSpawnClass(counts, CYBERTRON_CLASS_DEFAULTS, new Mulberry32Adapter(i));
      if (r !== null) fires++;
    }
    // Expect ~1% = 100 ± some variance, allow 0.4%–2%
    expect(fires).toBeGreaterThanOrEqual(40);
    expect(fires).toBeLessThanOrEqual(200);
  });
});

describe('randomInitLoadout (T013)', () => {
  it('loadout ranges are [0, N) per C source', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rand = seeded(seed);
      const cyb_gold = 50_000;
      const l = randomInitLoadout(cyb_gold, rand);
      expect(l.fluxpod).toBeGreaterThanOrEqual(0);
      expect(l.fluxpod).toBeLessThan(5);
      expect(l.decoys).toBeGreaterThanOrEqual(0);
      expect(l.decoys).toBeLessThan(25);
      expect(l.torpedo).toBeGreaterThanOrEqual(0);
      expect(l.torpedo).toBeLessThan(25);
      expect(l.mine).toBeGreaterThanOrEqual(0);
      expect(l.mine).toBeLessThan(100);
      expect(l.jammers).toBeGreaterThanOrEqual(0);
      expect(l.jammers).toBeLessThan(100);
      expect(l.gold).toBeGreaterThanOrEqual(0);
      expect(l.gold).toBeLessThan(cyb_gold);
    }
  });
});

describe('randomCybSkill (T013)', () => {
  it('cybskill is always in [3, 17]', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rand = seeded(seed);
      const s = randomCybSkill(rand);
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(17);
    }
  });
});

// ─── T014: pickPursuitBand — four-band ordering ────────────────────────────

describe('pickPursuitBand (T014)', () => {
  const hyperdist1 = 25;
  const hyperdist2 = 10;
  const classMaxShields = 3;
  const topSpeed = 8000;
  const rand = seeded(42);

  it('hyperwarp band: distance >= hyperdist1 → where=1, speed=distance*2000, shield=0', () => {
    const dist = hyperdist1 + 5; // 30
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(1);
    expect(result.desiredSpeed).toBeCloseTo(dist * 2000.0);
    expect(result.shield).toBe(0);
    expect(result.raiseShields).toBe(false);
  });

  it('hyperwarp band: exactly at hyperdist1 boundary', () => {
    const result = pickPursuitBand(hyperdist1, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(1);
  });

  it('brake band: hyperdist2 ≤ distance < hyperdist1 → where=0, desiredSpeed=topSpeed', () => {
    const dist = 15; // between 10 and 25
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(0);
    expect(result.desiredSpeed).toBe(topSpeed);
  });

  it('brake band: dropping from hyperwarp restores the shield charge but does not raise them', () => {
    // C's brake band (GECYBS.C:756-769) has no shieldup call at all — only the
    // two close bands do. The charge restore on hyperwarp exit is the port's
    // own R-9 decision and stays.
    const dist = 15;
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 1, classMaxShields, topSpeed, rand);
    expect(result.raiseShields).toBe(false);
    expect(result.shield).toBe(classMaxShields);
  });

  it('close band: 3.0 < distance < hyperdist2 → where=0, desiredSpeed=topSpeed', () => {
    const dist = 6;
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(0);
    expect(result.desiredSpeed).toBe(topSpeed);
  });

  it('combat band: distance ≤ 3.0 → where=0', () => {
    const dist = 2.0;
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(0);
    expect(result.desiredSpeed).toBe(990.0); // dist > 0.5
  });

  it('combat band: distance ≤ 0.5 → desiredSpeed is random < 500', () => {
    const dist = 0.3;
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.desiredSpeed).toBeGreaterThanOrEqual(0);
    expect(result.desiredSpeed).toBeLessThan(500);
  });

  it('threshold ordering: no band leaks (d=10 should be brake, not close)', () => {
    const dist = 10; // exactly hyperdist2
    const result = pickPursuitBand(dist, hyperdist1, hyperdist2, 0, classMaxShields, topSpeed, rand);
    expect(result.where).toBe(0);
    expect(result.desiredSpeed).toBe(topSpeed); // brake band
  });
});

// ─── T033: gebemean ────────────────────────────────────────────────────────

describe('gebemean (T033)', () => {
  it('cyberquad (tough=1) always returns true', () => {
    for (let i = 0; i < 100; i++) {
      expect(gebemean(CYB_TOUGH_1, 0, CYB_BE_NICE, CYBSLO, seeded(i))).toBe(true);
    }
  });

  it('target kills > CYB_BE_NICE always returns true', () => {
    for (let i = 0; i < 100; i++) {
      expect(gebemean(CYB_TOUGH_0, CYB_BE_NICE + 1, CYB_BE_NICE, CYBSLO, seeded(i))).toBe(true);
    }
  });

  it('ordinary + kills <= CYB_BE_NICE → 1-in-CYBSLO chance (approximately 33%)', () => {
    let trueCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (gebemean(CYB_TOUGH_0, 0, CYB_BE_NICE, CYBSLO, seeded(i))) trueCount++;
    }
    const rate = trueCount / trials;
    // 1-in-3 ≈ 33%; allow ±10% tolerance
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.45);
  });
});

// ─── T034: rollTorpedoCount ────────────────────────────────────────────────

describe('rollTorpedoCount (T034)', () => {
  it('class with no torpedo → 0', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollTorpedoCount(CYB_TOUGH_1, 100, false, true, CYB_BE_EASY, seeded(i))).toBe(0);
    }
  });

  it('gebemean=false → 0', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollTorpedoCount(CYB_TOUGH_0, 5, true, false, CYB_BE_EASY, seeded(i))).toBe(0);
    }
  });

  it('cyberquad (tough=1) + hasTorpedo + gebemean → 0..5', () => {
    for (let i = 0; i < 100; i++) {
      const v = rollTorpedoCount(CYB_TOUGH_1, 0, true, true, CYB_BE_EASY, seeded(i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('ordinary + target kills >= CYB_BE_EASY → full volley (0..5)', () => {
    for (let i = 0; i < 100; i++) {
      const v = rollTorpedoCount(CYB_TOUGH_0, CYB_BE_EASY, true, true, CYB_BE_EASY, seeded(i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('ordinary + target kills < CYB_BE_EASY → small volley (0..1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = rollTorpedoCount(CYB_TOUGH_0, CYB_BE_EASY - 1, true, true, CYB_BE_EASY, seeded(i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2);
    }
  });
});
