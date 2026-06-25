import { lockFact } from '../../../src/game/combat/combat-math';
import { TORFACT, MISFACT } from '../../../src/game/constants';

describe('lockFact (GECMDS.C:1378-1392)', () => {
  it('torpedo: close, both stationary ⇒ strong lock (>0.7)', () => {
    expect(lockFact('torpedo', 0, 0, 1, TORFACT)).toBeGreaterThan(0.7);
  });
  it('torpedo: target at warp (speed>999) ⇒ no lock (0)', () => {
    expect(lockFact('torpedo', 0, 2000, 1, TORFACT)).toBe(0);
  });
  it('torpedo: far target ⇒ weak lock (<=0.7)', () => {
    // dist 5 ⇒ (5-5)=0 ⇒ fact 0
    expect(lockFact('torpedo', 0, 0, 5, TORFACT)).toBeLessThanOrEqual(0.7);
  });
  it('missile: close ⇒ strong, far ⇒ weak', () => {
    expect(lockFact('missile', 0, 0, 1, MISFACT)).toBeGreaterThan(0.7);
    expect(lockFact('missile', 0, 0, 5, MISFACT)).toBeLessThanOrEqual(0.7);
  });
});
