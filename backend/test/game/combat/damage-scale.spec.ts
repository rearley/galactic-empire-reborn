import { damageScale } from '../../../src/game/combat/combat-math';

describe('damageScale — C ton_fact (GEFUNCS.C:2661): multiplier = 100 / victim.damageFactor', () => {
  it('damageFactor 100 = neutral (1.0×)', () => {
    expect(damageScale(100)).toBeCloseTo(1.0, 10);
  });
  it('damageFactor 200 (tough) halves incoming damage', () => {
    expect(damageScale(200)).toBeCloseTo(0.5, 10);
  });
  it('damageFactor 90 (fragile) takes ~1.11×', () => {
    expect(damageScale(90)).toBeCloseTo(100 / 90, 10);
  });
  it('damageFactor 2000 (Base Star) takes 0.05×', () => {
    expect(damageScale(2000)).toBeCloseTo(0.05, 10);
  });
  it('guards non-positive damageFactor → 1.0 (no scaling)', () => {
    expect(damageScale(0)).toBe(1);
    expect(damageScale(-5)).toBe(1);
  });
});
