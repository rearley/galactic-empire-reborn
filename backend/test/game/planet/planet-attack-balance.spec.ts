/**
 * T015 / T028 — Balance regression tests for planet-attack DI token defaults.
 * Asserts all six combat coefficients resolve to the canonical values from research.md D2.
 * These tests MUST fail if any constant is changed.
 * @see GEMAIN.C:532–548 numopt calls for PLATTR*
 * @see GEMAIN.H:138 FIRETICKS
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
  it('PLATTRT1 default == 0.05', () => {
    expect(PLATTRT1_DEFAULT).toBe(0.05);
  });

  it('PLATTRT2 default == 0.05', () => {
    expect(PLATTRT2_DEFAULT).toBe(0.05);
  });

  it('loadPlattrt1() returns 0.05 with empty env', () => {
    expect(loadPlattrt1({})).toBe(0.05);
  });

  it('loadPlattrt2() returns 0.05 with empty env', () => {
    expect(loadPlattrt2({})).toBe(0.05);
  });

  it('FIRETICKS default == 10', () => {
    expect(FIRETICKS_DEFAULT).toBe(10);
  });

  it('loadFireticks() returns 10 with empty env', () => {
    expect(loadFireticks({})).toBe(10);
  });
});

describe('Planet attack balance regression — fighter coefficients (T028)', () => {
  it('PLATTRF1 default == 0.05', () => {
    expect(PLATTRF1_DEFAULT).toBe(0.05);
  });

  it('PLATTRF2 default == 0.05', () => {
    expect(PLATTRF2_DEFAULT).toBe(0.05);
  });

  it('PLATTRF3 default == 0.05', () => {
    expect(PLATTRF3_DEFAULT).toBe(0.05);
  });

  it('loadPlattrf1() returns 0.05 with empty env', () => {
    expect(loadPlattrf1({})).toBe(0.05);
  });

  it('loadPlattrf2() returns 0.05 with empty env', () => {
    expect(loadPlattrf2({})).toBe(0.05);
  });

  it('loadPlattrf3() returns 0.05 with empty env', () => {
    expect(loadPlattrf3({})).toBe(0.05);
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
