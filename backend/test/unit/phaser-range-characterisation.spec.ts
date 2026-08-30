/**
 * Characterisation of starter-ship phaser reach — deliberately printed, not just asserted.
 *
 * Question under test: can a class 1 Interceptor meaningfully hit targets far
 * across the galaxy? Two independent limits apply:
 *   1. C-001 (feature 022) gates the beam on the firer's scanRange.
 *   2. pdamage falls to zero at disfact = 20000 + phasrtype*4000 (GEFUNCS.C:2082).
 *
 * 10_000 raw units == 1 sector, so the galaxy is 30 sectors == 300_000 units wide.
 */

import { phaserDamage } from '../../src/game/combat/combat-math';

const INTERCEPTOR_SCAN_RANGE = 15_000; // ShipClass seed, class 1
const INTERCEPTOR_MAX_PHASR = 10;      // ShipClass seed, class 1
const KILL_THRESHOLD = 100;            // combat-tick.service.ts:180 — damage >= 100 destroys a ship

describe('starter Interceptor phaser reach', () => {
  const shot = (distRaw: number, phasrtype = INTERCEPTOR_MAX_PHASR) =>
    phaserDamage({
      phasrtype,
      phasr: 100,          // fully charged
      distRaw,
      focus: 0,            // tightest focus == most damage
      victimMaxTons: 100,
      victimAtWarp: false,
    });

  it('prints the damage curve and overkill multiples for the record', () => {
    const rows = [500, 1_000, 5_000, 10_000, 14_999, 20_000, 40_000, 59_999, 60_000, 100_000, 300_000]
      .map((d) => `${String(d).padStart(7)} units (${(d / 10_000).toFixed(2)} sectors): ${shot(d)}`);
    const overkill = [1, 2, 5, 10, 15, 19]
      .map((pt) => `  phasrtype ${String(pt).padStart(2)}: ${String(shot(500, pt)).padStart(5)} = ${(shot(500, pt) / KILL_THRESHOLD).toFixed(1)}x kill threshold`);
    // eslint-disable-next-line no-console
    console.log(
      '\nInterceptor phasrtype=10, phasr=100, focus=0:\n' + rows.join('\n') +
      '\n\nPoint-blank damage vs the 100-damage kill threshold:\n' + overkill.join('\n'),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('combat has an arc: weak phasers no longer one-shot, maxed ones still do', () => {
    // combat-tick.service.ts:180 kills any ship at damage >= 100. Under the
    // original PDAMMAX=200 every phaser type cleared that in one hit
    // (phasrtype 1 => 155). At the tuned default of 25 only the heaviest
    // phasers one-shot at point-blank. @see test/balance/pdammax.balance.spec.ts
    expect(shot(500, 1)).toBeLessThan(KILL_THRESHOLD);
    expect(shot(500, 19)).toBeGreaterThanOrEqual(KILL_THRESHOLD);
  });

  it('does real damage at point-blank range', () => {
    expect(shot(500)).toBeGreaterThan(0);
  });

  it('damage decreases monotonically with distance', () => {
    // NB: .map(shot) would pass the array index as phasrtype — call explicitly.
    const samples = [500, 2_000, 5_000, 10_000, 14_000].map((d) => shot(d));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it('deals zero damage at and beyond disfact, independent of the scanRange gate', () => {
    const disfact = 20_000 + INTERCEPTOR_MAX_PHASR * 4_000; // 60_000
    expect(shot(disfact)).toBe(0);
    expect(shot(disfact + 1)).toBe(0);
  });

  it('cannot reach across the galaxy — a shot one galaxy-width away is zero', () => {
    const galaxyWidthRaw = 30 * 10_000;
    expect(shot(galaxyWidthRaw)).toBe(0);
  });

  it('the scanRange gate binds before the damage falloff for the starter ship', () => {
    // The beam is gated at 15_000 but pdamage would still deal damage there,
    // so the C-001 gate — not the falloff — is what limits an Interceptor.
    expect(shot(INTERCEPTOR_SCAN_RANGE)).toBeGreaterThan(0);
  });
});
