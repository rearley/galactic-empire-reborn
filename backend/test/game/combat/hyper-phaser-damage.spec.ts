import { hyperPhaserDamage } from '../../../src/game/combat/combat-math';

/**
 * Hyper-phaser damage — C `pdamage` warp branch (GEFUNCS.C:2069-2077) folded
 * into `firehp`'s outer scaling (GECMDS.C:1056-1067):
 *   dd     = max(0, 1 - distRaw/40000)
 *   dp     = dd ^ HPFIRDST            (HPFIRDST = 1 → linear)
 *   dam    = HPDAMMAX * dp            (HPDAMMAX = 200)
 *   factor = dam * phasrtype / (1 + victimMaxTons/TONFACT)
 *   phasrtype === 20 (sysop) → 101
 *   floor(factor)
 */
describe('hyperPhaserDamage — C firehp/pdamage warp branch', () => {
  it('point-blank (dist 0): floor(HPDAMMAX * phasrtype / 1)', () => {
    // dd=1 so dp=1 regardless of HPFIRDST, and the result is HPDAMMAX*phasrtype.
    // Canon HPDAMMAX is 50; the port ran 200, the numopt CEILING.
    expect(hyperPhaserDamage({ phasrtype: 1, distRaw: 0, victimMaxTons: 0 })).toBe(50);
    expect(hyperPhaserDamage({ phasrtype: 3, distRaw: 0, victimMaxTons: 0 })).toBe(150);
  });

  it('falls to zero at 40000 raw and beyond (dd clamped to 0)', () => {
    expect(hyperPhaserDamage({ phasrtype: 5, distRaw: 40000, victimMaxTons: 0 })).toBe(0);
    expect(hyperPhaserDamage({ phasrtype: 5, distRaw: 50000, victimMaxTons: 0 })).toBe(0);
  });

  it('heavier victim (maxTons 15000 → tonfact 2) takes half', () => {
    const light = hyperPhaserDamage({ phasrtype: 1, distRaw: 0, victimMaxTons: 0 });
    const heavy = hyperPhaserDamage({ phasrtype: 1, distRaw: 0, victimMaxTons: 15000 });
    expect(heavy).toBe(Math.floor(light / 2)); // 100
  });

  it('sysop phaser (type 20) is fixed at 101 regardless of distance/tonnage', () => {
    expect(hyperPhaserDamage({ phasrtype: 20, distRaw: 0, victimMaxTons: 0 })).toBe(101);
    expect(hyperPhaserDamage({ phasrtype: 20, distRaw: 30000, victimMaxTons: 15000 })).toBe(101);
  });

  it('HPFIRDST=9 ⇒ the hyperspace beam dies almost immediately', () => {
    // This test used to assert LINEAR falloff, because the port ran HPFIRDST=1
    // -- the numopt FLOOR. Canon ships 9, so dp = dd^9 and the beam collapses:
    //
    //     dist        0     4000   10000   20000+
    //     phasrtype 1 50      19       3        0
    //     phasrtype 10 500   190      30        0
    //
    // The combination of the old floor and the old ceiling was the single most
    // lethal error in the port: at HPDAMMAX 200 / HPFIRDST 1, a hyperspace
    // phaser at two sectors dealt ~937 after the Mark-10 scaling -- an instant
    // kill against a 100-damage threshold -- where canon deals nothing at all.
    const pointBlank = hyperPhaserDamage({ phasrtype: 2, distRaw: 0, victimMaxTons: 0 });
    const halfRange = hyperPhaserDamage({ phasrtype: 2, distRaw: 20_000, victimMaxTons: 0 });
    expect(halfRange).toBe(0);
    expect(halfRange).toBeLessThan(pointBlank / 10);

    // Still meaningful at knife range, which is the point of the weapon.
    expect(hyperPhaserDamage({ phasrtype: 2, distRaw: 4_000, victimMaxTons: 0 })).toBeGreaterThan(0);
  });
});
