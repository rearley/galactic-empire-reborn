/**
 * T015 / T028 — Planet-attack combat coefficient defaults.
 *
 * These asserted 0.05 for all five PLATTR* coefficients, under a docstring
 * claiming they were "the canonical values". 0.05 is `numopt(PLATTRx,5,...)/100`
 * -- the clamp FLOOR. MBMGEMSG.MSG ships 18 / 100 / 55 / 125 / 35, i.e.
 * 0.18 / 1.00 / 0.55 / 1.25 / 0.35.
 *
 * The two troop coefficients are independently confirmed by Murdock's own
 * worked comments in the source: GECMDS.C:3671 annotates `rndm(plattrt1)+.25`
 * with `/*.766*\/` and :3676 annotates `rndm(plattrt2)+.1` with `/* .344 *\/`.
 * Those sample values are reachable only at 1.25 and 0.35 -- at 0.05 the first
 * expression cannot exceed 0.3.
 *
 * Effect of the floor: defender kill dropped from a mean of 0.875x the garrison
 * to 0.275x, and all the variance that made a large garrison frightening
 * disappeared.
 *
 * FIRETICKS is different in kind -- a GEMAIN.H:138 #define, genuinely fixed --
 * so it stays pinned exactly.
 *
 * @see GEMAIN.C:532-548 numopt calls for PLATTR*
 * @see test/balance/sysop-options-canon.balance.spec.ts — owns the raw defaults
 */
import {
  loadPlattrt1, loadPlattrt2,
  loadPlattrf1, loadPlattrf2, loadPlattrf3,
  loadFireticks,
  PLATTRT1_DEFAULT, PLATTRT2_DEFAULT,
  PLATTRF1_DEFAULT, PLATTRF2_DEFAULT, PLATTRF3_DEFAULT,
  FIRETICKS_DEFAULT,
} from '../../../src/game/commands/attack.config';

describe('Planet attack balance regression — troop coefficients (T015)', () => {
  it('PLATTRT1 default is canon 1.25, not the clamp floor', () => {
    expect(PLATTRT1_DEFAULT).toBeCloseTo(1.25, 10);
  });

  it('PLATTRT2 default is canon 0.35, not the clamp floor', () => {
    expect(PLATTRT2_DEFAULT).toBeCloseTo(0.35, 10);
  });

  it('loadPlattrt1() returns canon 1.25 with empty env', () => {
    expect(loadPlattrt1({})).toBeCloseTo(1.25, 10);
  });

  it('loadPlattrt2() returns canon 0.35 with empty env', () => {
    expect(loadPlattrt2({})).toBeCloseTo(0.35, 10);
  });

  it('FIRETICKS default == 10', () => {
    expect(FIRETICKS_DEFAULT).toBe(10);
  });

  it('loadFireticks() returns 10 with empty env', () => {
    expect(loadFireticks({})).toBe(10);
  });
});

describe('Planet attack balance regression — fighter coefficients (T028)', () => {
  it('PLATTRF1 default is canon 0.18, not the clamp floor', () => {
    expect(PLATTRF1_DEFAULT).toBeCloseTo(0.18, 10);
  });

  it('PLATTRF2 default is canon 1, not the clamp floor', () => {
    expect(PLATTRF2_DEFAULT).toBeCloseTo(1, 10);
  });

  it('PLATTRF3 default is canon 0.55, not the clamp floor', () => {
    expect(PLATTRF3_DEFAULT).toBeCloseTo(0.55, 10);
  });

  it('loadPlattrf1() returns canon 0.18 with empty env', () => {
    expect(loadPlattrf1({})).toBeCloseTo(0.18, 10);
  });

  it('loadPlattrf2() returns canon 1 with empty env', () => {
    expect(loadPlattrf2({})).toBeCloseTo(1, 10);
  });

  it('loadPlattrf3() returns canon 0.55 with empty env', () => {
    expect(loadPlattrf3({})).toBeCloseTo(0.55, 10);
  });
});

describe('Planet attack balance regression — env-var overrides', () => {
  it('loadPlattrt1() parses PLATTRT1 env var', () => {
    expect(loadPlattrt1({ PLATTRT1: '0.10' })).toBe(0.10);
  });

  it('loadFireticks() parses FIRETICKS env var', () => {
    expect(loadFireticks({ FIRETICKS: '20' })).toBe(20);
  });

  it('loadPlattrt1() falls back to default for invalid env var', () => {
    expect(loadPlattrt1({ PLATTRT1: 'notanumber' })).toBe(PLATTRT1_DEFAULT);
  });

  it('loadFireticks() falls back to default for invalid env var', () => {
    expect(loadFireticks({ FIRETICKS: 'notanumber' })).toBe(FIRETICKS_DEFAULT);
  });
});
