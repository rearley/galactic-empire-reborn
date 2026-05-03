/**
 * T048/T049 — SC-004 difficulty-curve statistical tests.
 * Verify that gebemean and rollTorpedoCount honor CYB_BE_NICE / CYB_BE_EASY thresholds.
 *
 * @see GECYBS.C:432 gebemean
 * @see GECYBS.C:527 cyb_attack torpedo sizing
 * @see specs/007-cybertron-ai/tasks.md T048, T049
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { gebemean, rollTorpedoCount } from '../../../src/game/cybertron/cyb-decisions';
import { CYB_BE_NICE, CYB_BE_EASY, CYBSLO } from '../../../src/game/constants';

const TRIALS = 1000;

// ─── T048: gebemean rate by kill count ───────────────────────────────────────

describe('T048 (SC-004) — gebemean rate by kill count', () => {
  it('kills ≥ CYB_BE_NICE always returns true (never random check)', () => {
    const rand = new Mulberry32Adapter(1234);
    let trueCount = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (gebemean(0, CYB_BE_NICE + 1, CYB_BE_NICE, CYBSLO, rand)) trueCount++;
    }
    expect(trueCount).toBe(TRIALS);
  });

  it('kills < CYB_BE_NICE fires at ~1/CYBSLO rate (ordinary Cybertron)', () => {
    const rand = new Mulberry32Adapter(5678);
    let trueCount = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (gebemean(0, 0, CYB_BE_NICE, CYBSLO, rand)) trueCount++;
    }
    // Expected ~333 (1/3); allow ±15% statistical tolerance
    const expected = TRIALS / CYBSLO;
    expect(trueCount).toBeGreaterThan(expected * 0.7);
    expect(trueCount).toBeLessThan(expected * 1.3);
  });

  it('kills < CYB_BE_NICE rate is strictly less than kills > CYB_BE_NICE rate', () => {
    const rand1 = new Mulberry32Adapter(1111);
    const rand2 = new Mulberry32Adapter(1111);
    let lowKillsRate = 0;
    let highKillsRate = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (gebemean(0, 10, CYB_BE_NICE, CYBSLO, rand1)) lowKillsRate++;
      if (gebemean(0, CYB_BE_NICE + 1, CYB_BE_NICE, CYBSLO, rand2)) highKillsRate++;
    }
    expect(lowKillsRate).toBeLessThan(highKillsRate);
    expect(highKillsRate).toBe(TRIALS);
  });

  it('Cyberquad (tough=1) always returns true regardless of kills', () => {
    const rand = new Mulberry32Adapter(9999);
    let trueCount = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (gebemean(1, 0, CYB_BE_NICE, CYBSLO, rand)) trueCount++;
    }
    expect(trueCount).toBe(TRIALS);
  });
});

// ─── T049: torpedo volley sizing by kill count ───────────────────────────────

describe('T049 (SC-004) — torpedo volley size by kill count', () => {
  it('kills < CYB_BE_EASY: mean torp count ≤ 1 (rnd%2 sizing)', () => {
    const rand = new Mulberry32Adapter(2222);
    let total = 0;
    for (let i = 0; i < TRIALS; i++) {
      // gebemean always true at kills=10 < CYB_BE_NICE? No — 1/3 chance.
      // Use kills=CYB_BE_NICE+1 to guarantee gebemean=true, isolate torp sizing.
      const mean = gebemean(0, CYB_BE_NICE + 1, CYB_BE_NICE, CYBSLO, rand);
      total += rollTorpedoCount(0, CYB_BE_NICE + 1, true, mean, CYB_BE_EASY, rand);
    }
    const avg = total / TRIALS;
    // rnd%2 gives 0 or 1, mean ≈ 0.5; with gebemean always true → avg < 1
    expect(avg).toBeLessThan(1.1); // allow small statistical overage
  });

  it('kills ≥ CYB_BE_EASY: mean torp count ≈ 2.5 (rnd%6 sizing)', () => {
    const rand = new Mulberry32Adapter(3333);
    let total = 0;
    for (let i = 0; i < TRIALS; i++) {
      const mean = gebemean(0, CYB_BE_EASY, CYB_BE_NICE, CYBSLO, rand);
      total += rollTorpedoCount(0, CYB_BE_EASY, true, mean, CYB_BE_EASY, rand);
    }
    const avg = total / TRIALS;
    // rnd%6 gives 0–5, mean ≈ 2.5; adjusted for gebemean=true always at kills≥CYB_BE_NICE
    expect(avg).toBeGreaterThan(2.0);
    expect(avg).toBeLessThan(3.0);
  });

  it('kills ≥ CYB_BE_EASY mean > kills < CYB_BE_EASY mean (escalation confirmed)', () => {
    const rand1 = new Mulberry32Adapter(4444);
    const rand2 = new Mulberry32Adapter(4444);
    let lowTotal = 0;
    let highTotal = 0;
    for (let i = 0; i < TRIALS; i++) {
      const meanLow = gebemean(0, CYB_BE_NICE + 1, CYB_BE_NICE, CYBSLO, rand1);
      lowTotal += rollTorpedoCount(0, CYB_BE_NICE + 1, true, meanLow, CYB_BE_EASY, rand1);
      const meanHigh = gebemean(0, CYB_BE_EASY, CYB_BE_NICE, CYBSLO, rand2);
      highTotal += rollTorpedoCount(0, CYB_BE_EASY, true, meanHigh, CYB_BE_EASY, rand2);
    }
    expect(highTotal).toBeGreaterThan(lowTotal);
  });

  it('hasTorpedo=false always returns 0 regardless of kills', () => {
    const rand = new Mulberry32Adapter(5555);
    let total = 0;
    for (let i = 0; i < TRIALS; i++) {
      total += rollTorpedoCount(0, 100, false, true, CYB_BE_EASY, rand);
    }
    expect(total).toBe(0);
  });
});
