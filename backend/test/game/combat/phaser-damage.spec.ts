import { phaserDamage } from '../../../src/game/combat/combat-math';

describe('phaserDamage — C pdamage falloff (GEFUNCS.C:2060 + firep scaling GECMDS.C:956-973)', () => {
  const base = { phasrtype: 1, phasr: 100, focus: 0, victimMaxTons: 0, victimAtWarp: false };

  it('point-blank deals substantial damage', () => {
    const d = phaserDamage({ ...base, distRaw: 0 });
    // disfact=24000, dd=1, fd=1, dp=1*1*(100/100)=1, dam=PDAMMAX*1=200; (1+1)/2.5=0.8; tonfact=1 -> 160
    expect(d).toBe(160);
  });

  it('falls to zero at/after disfact (24000 raw = 2.4 sectors for phasrtype 1)', () => {
    expect(phaserDamage({ ...base, distRaw: 24000 })).toBe(0);
    expect(phaserDamage({ ...base, distRaw: 30000 })).toBe(0);
  });

  it('half-disfact deals roughly half (linear pfirdist=1)', () => {
    // dist=12000 -> dd=0.5 -> dp=0.5 -> dam=100 -> *0.8 -> 80
    expect(phaserDamage({ ...base, distRaw: 12000 })).toBe(80);
  });

  it('heavier victim takes less (tonfact divisor)', () => {
    const light = phaserDamage({ ...base, distRaw: 0, victimMaxTons: 0 });
    const heavy = phaserDamage({ ...base, distRaw: 0, victimMaxTons: 15000 }); // tonfact=2
    expect(heavy).toBe(Math.floor(light / 2));
  });

  it('focus widens the cone but REDUCES damage (fd² term)', () => {
    const sharp = phaserDamage({ ...base, distRaw: 0, focus: 0 });
    const wide = phaserDamage({ ...base, distRaw: 0, focus: 5 });
    expect(wide).toBeLessThan(sharp);
  });

  it('victim at warp takes half (firep /2 branch)', () => {
    const ground = phaserDamage({ ...base, distRaw: 0, victimAtWarp: false });
    const warp = phaserDamage({ ...base, distRaw: 0, victimAtWarp: true });
    expect(warp).toBe(Math.floor(ground / 2));
  });

  it('sysop phaser (type 20) is fixed at 101', () => {
    expect(phaserDamage({ ...base, phasrtype: 20, distRaw: 0 })).toBe(101);
  });
});
