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
    // dd=1, dp=1, dam=200, factor=200*1/1=200
    expect(hyperPhaserDamage({ phasrtype: 1, distRaw: 0, victimMaxTons: 0 })).toBe(200);
    // factor=200*3=600
    expect(hyperPhaserDamage({ phasrtype: 3, distRaw: 0, victimMaxTons: 0 })).toBe(600);
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

  it('HPFIRDST=1 ⇒ linear falloff: half distance ⇒ half base damage', () => {
    // dist=20000 → dd=0.5 → dp=0.5 → dam=100 → factor=100*phasrtype/1
    expect(hyperPhaserDamage({ phasrtype: 2, distRaw: 20000, victimMaxTons: 0 })).toBe(200);
    // sanity: that is exactly half of the point-blank value for the same phasrtype
    const pointBlank = hyperPhaserDamage({ phasrtype: 2, distRaw: 0, victimMaxTons: 0 });
    expect(hyperPhaserDamage({ phasrtype: 2, distRaw: 20000, victimMaxTons: 0 })).toBe(pointBlank / 2);
  });
});
