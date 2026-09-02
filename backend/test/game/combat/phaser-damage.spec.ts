import { PDAMMAX, PFIRDST, TONFACT, HPDAMMAX, HPFIRDST } from '../../../src/game/constants';
import { phaserDamage, hyperPhaserDamage } from '../../../src/game/combat/combat-math';

describe('phaserDamage — C pdamage falloff (GEFUNCS.C:2060 + firep scaling GECMDS.C:956-973)', () => {
  const base = { phasrtype: 1, phasr: 100, focus: 0, victimMaxTons: 0, victimAtWarp: false };

  it('point-blank deals substantial damage', () => {
    const d = phaserDamage({ ...base, distRaw: 0 });
    // disfact=24000, dd=1, fd=1, dp=1*1*(100/100)=1, dam=PDAMMAX; (1+1)/2.5=0.8; tonfact=1
    // Derived from PDAMMAX so the test survives playtest retuning.
    expect(d).toBe(Math.floor(PDAMMAX * 0.8));
  });

  it('falls to zero at/after disfact (24000 raw = 2.4 sectors for phasrtype 1)', () => {
    expect(phaserDamage({ ...base, distRaw: 24000 })).toBe(0);
    expect(phaserDamage({ ...base, distRaw: 30000 })).toBe(0);
  });

  it('halves at half the falloff distance', () => {
    // dist=12000 -> dd=0.5 -> dp = 0.5^PFIRDST -> dam = trunc(PDAMMAX*dp) -> *0.8
    // The base truncates inside pdamage (`unsigned dam`), so this is not the
    // same as flooring the product once at the end.
    //
    // PFIRDST is a sysop option (numopt(PFIRDST,1,20), GEMAIN.C:493) and this
    // deployment does not have to run at 1, so the expectation is derived from
    // the configured exponent rather than assuming the linear case.
    const dp = Math.pow(0.5, PFIRDST);
    expect(phaserDamage({ ...base, distRaw: 12000 })).toBe(
      Math.floor(Math.trunc(PDAMMAX * dp) * 0.8),
    );
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

/**
 * `pdamage` returns `unsigned dam` — the base damage is TRUNCATED to a whole
 * number inside pdamage, and only then do firep/firehp scale it by phasrtype
 * and the victim's tonnage (GECMDS.C:956-969, 1056-1063). The port carried a
 * float all the way through and floored once at the end, which lets a fraction
 * of a point of base damage ride the outer multiplier up into whole points.
 *
 * @see GEFUNCS.C:2060-2092 `unsigned dam; ... dam = pdammax * dp;`
 */
describe('pdamage truncates its base damage before the outer scaling', () => {
  it('matches the value C would produce across a range of shots', () => {
    for (const distRaw of [0, 1234, 5678, 9999, 15000]) {
      for (const focus of [1, 3, 7]) {
        const args = {
          phasrtype: 3,
          phasr: 87,
          distRaw,
          focus,
          victimMaxTons: 1300,
          victimAtWarp: false,
        };
        const disfact = 20000 + args.phasrtype * 4000;
        const dd = Math.max(0, 1 - distRaw / disfact);
        const fd = 1 - focus / 11;
        const dp = Math.pow(dd, PFIRDST) * (fd * fd) * (args.phasr / 100);
        // C: `unsigned dam = pdammax * dp` — truncated HERE, not at the end.
        const cDam = Math.trunc(PDAMMAX * dp);
        const tonfact = 1 + args.victimMaxTons / TONFACT;
        const expected = Math.floor((cDam * ((1 + args.phasrtype) / 2.5)) / tonfact);
        expect(phaserDamage(args)).toBe(expected);
      }
    }
  });

  it('applies the same truncation on the hyper-phaser branch', () => {
    const distRaw = 7777;
    const dd = Math.max(0, 1 - distRaw / 40000);
    const cDam = Math.trunc(HPDAMMAX * Math.pow(dd, HPFIRDST));
    const expected = Math.floor((cDam * 4) / (1 + 1300 / TONFACT));
    expect(hyperPhaserDamage({ phasrtype: 4, distRaw, victimMaxTons: 1300 })).toBe(expected);
  });
});
