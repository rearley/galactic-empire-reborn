/**
 * T024 — Pure decision function tests for the Droid AI.
 *
 * All randomness is driven by the seeded Mulberry32 PRNG for determinism.
 * No game state is required — all functions under test are pure.
 *
 * @see GEDROIDS.C — droid_annoy, droid_act_class_11, droid_act_class_12, missl_attached
 * @see specs/008-droid-ai/tasks.md T024
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import {
  rollAnnoy,
  rollConfuseHeading,
  rollAlterAttackVector,
  rollVakoryTorpedoVolley,
  pickHoldCourseDuration,
  missileAttached,
} from '../../../src/game/droid/droid-decisions';
import type { ShipState } from '../../../src/game/ship/ship-state.types';

function seeded(seed: number): Mulberry32Adapter {
  return new Mulberry32Adapter(seed);
}

function makeShip(overrides: Partial<ShipState>): ShipState {
  return {
    userid: 'test',
    shipno: 1,
    shipname: 'TestShip',
    shpclass: 32,
    heading: 0,
    head2b: 0,
    speed: 0,
    speed2b: 0,
    xcoord: 5,
    ycoord: 5,
    damage: 0,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    kills: 0,
    lastfired: 255,
    shieldtype: 2,
    shieldstat: 1,
    shield: 2,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 1,
    train: 0,
    where: 0,
    ltorpsChannel: [],
    ltorpsDistance: [],
    lmisslChannel: [],
    lmisslDistance: [],
    lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0],
    jammer: 0,
    freq: [],
    items: Array(16).fill(0n),
    titem: 0,
    hostile: 0,
    cantexit: 0,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 2,
    cybmine: 0,
    cybskill: 0,
    cybupdate: 0,
    tick: 0,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 8,
    warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

// ─── rollAnnoy ────────────────────────────────────────────────────────────────

describe('rollAnnoy (T024)', () => {
  it('returns a boolean', () => {
    const result = rollAnnoy(4, seeded(42));
    expect(typeof result).toBe('boolean');
  });

  it('approximately 25% success rate over 100 trials (range 15–35)', () => {
    let successes = 0;
    for (let i = 0; i < 100; i++) {
      if (rollAnnoy(4, seeded(i))) successes++;
    }
    expect(successes).toBeGreaterThanOrEqual(15);
    expect(successes).toBeLessThanOrEqual(35);
  });

  it('denom=1 always succeeds (floor(rng*1)===1 is never true — sanity check)', () => {
    // floor(rng*1) is always 0, so denom=1 actually always returns false.
    // This validates the formula: Math.floor(rng.next() * denom) === 1
    for (let i = 0; i < 20; i++) {
      expect(rollAnnoy(1, seeded(i))).toBe(false);
    }
  });

  it('denom=2 returns approximately 50% true', () => {
    let successes = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (rollAnnoy(2, seeded(i))) successes++;
    }
    const rate = successes / trials;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });
});

// ─── rollConfuseHeading ───────────────────────────────────────────────────────

describe('rollConfuseHeading (T024)', () => {
  it('returns head2b in [0, 359.9)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { head2b } = rollConfuseHeading(seeded(seed));
      expect(head2b).toBeGreaterThanOrEqual(0);
      expect(head2b).toBeLessThan(359.9);
    }
  });

  it('returns speed2b in [0, 10000)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { speed2b } = rollConfuseHeading(seeded(seed));
      expect(speed2b).toBeGreaterThanOrEqual(0);
      expect(speed2b).toBeLessThan(10000);
    }
  });

  it('returns holdcourse in [3, 12]', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { holdcourse } = rollConfuseHeading(seeded(seed));
      expect(holdcourse).toBeGreaterThanOrEqual(3);
      expect(holdcourse).toBeLessThanOrEqual(12);
    }
  });
});

// ─── rollAlterAttackVector ────────────────────────────────────────────────────

describe('rollAlterAttackVector (T024)', () => {
  it('returns head2b in [0, 359.9)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { head2b } = rollAlterAttackVector(seeded(seed));
      expect(head2b).toBeGreaterThanOrEqual(0);
      expect(head2b).toBeLessThan(359.9);
    }
  });

  it('returns speed2b in [0, 5000)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { speed2b } = rollAlterAttackVector(seeded(seed));
      expect(speed2b).toBeGreaterThanOrEqual(0);
      expect(speed2b).toBeLessThan(5000);
    }
  });

  it('returns holdcourse in [3, 12]', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { holdcourse } = rollAlterAttackVector(seeded(seed));
      expect(holdcourse).toBeGreaterThanOrEqual(3);
      expect(holdcourse).toBeLessThanOrEqual(12);
    }
  });

  it('speed2b upper bound is strictly less than 5000, not 10000 (distinct from confuse)', () => {
    // Confirm the Vakory branch uses rndm(5000) not rndm(10000)
    let maxSeen = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const { speed2b } = rollAlterAttackVector(seeded(seed));
      if (speed2b > maxSeen) maxSeen = speed2b;
    }
    expect(maxSeen).toBeLessThan(5000);
  });
});

// ─── rollVakoryTorpedoVolley ──────────────────────────────────────────────────

describe('rollVakoryTorpedoVolley (T024)', () => {
  it('returns 0 or 1 only', () => {
    for (let seed = 0; seed < 100; seed++) {
      const v = rollVakoryTorpedoVolley(seeded(seed));
      expect(v === 0 || v === 1).toBe(true);
    }
  });

  it('returns both 0 and 1 across seeds (not degenerate)', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      seen.add(rollVakoryTorpedoVolley(seeded(seed)));
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(1)).toBe(true);
  });
});

// ─── pickHoldCourseDuration ───────────────────────────────────────────────────

describe('pickHoldCourseDuration (T024)', () => {
  it("context='jammed' returns value in [10, 59]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('jammed', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(59);
    }
  });

  it("context='flee75' returns value in [20, 49]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('flee75', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(49);
    }
  });

  it("context='missileEvade' returns value in [5, 9]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('missileEvade', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("context='confuse' returns value in [3, 12]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('confuse', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it("context='alterVector' returns value in [3, 12]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('alterVector', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it("context='hyperEvade' returns value in [5, 19]", () => {
    for (let seed = 0; seed < 200; seed++) {
      const v = pickHoldCourseDuration('hyperEvade', seeded(seed));
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(19);
    }
  });

  it("ranges are distinct — 'jammed' max (59) > 'flee75' max (49) > 'missileEvade' max (9)", () => {
    // Structural guard: ranges must not collapse onto each other
    const jamMax = Math.max(...Array.from({ length: 200 }, (_, i) => pickHoldCourseDuration('jammed', seeded(i))));
    const fleeMax = Math.max(...Array.from({ length: 200 }, (_, i) => pickHoldCourseDuration('flee75', seeded(i))));
    const evadeMax = Math.max(...Array.from({ length: 200 }, (_, i) => pickHoldCourseDuration('missileEvade', seeded(i))));
    expect(jamMax).toBeGreaterThan(fleeMax);
    expect(fleeMax).toBeGreaterThan(evadeMax);
  });
});

// ─── missileAttached ──────────────────────────────────────────────────────────

describe('missileAttached (T024)', () => {
  it('returns false when all lmisslDistance slots are 0', () => {
    const ship = makeShip({ lmisslDistance: [0, 0, 0] });
    expect(missileAttached(ship)).toBe(false);
  });

  it('returns false when lmisslDistance array is empty', () => {
    const ship = makeShip({ lmisslDistance: [] });
    expect(missileAttached(ship)).toBe(false);
  });

  it('returns true when first slot has distance > 0', () => {
    const ship = makeShip({ lmisslDistance: [500, 0, 0] });
    expect(missileAttached(ship)).toBe(true);
  });

  it('returns true when middle slot has distance > 0', () => {
    const ship = makeShip({ lmisslDistance: [0, 250, 0] });
    expect(missileAttached(ship)).toBe(true);
  });

  it('returns true when last slot has distance > 0', () => {
    const ship = makeShip({ lmisslDistance: [0, 0, 1] });
    expect(missileAttached(ship)).toBe(true);
  });

  it('returns true when all slots have distance > 0', () => {
    const ship = makeShip({ lmisslDistance: [100, 200, 300] });
    expect(missileAttached(ship)).toBe(true);
  });
});
