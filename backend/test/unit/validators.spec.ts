import { describe, it, expect } from 'vitest';
import { valdegree, valpcnt } from '../../src/game/commands/validators';

/**
 * Balance regression tests — these constants come from GEFUNCS.C:1933 / GEFUNCS.C:1906.
 * A test failure here means a validator boundary constant changed.
 * @see GEFUNCS.C:1933 valdegree
 * @see GEFUNCS.C:1906 valpcnt
 */
describe('valdegree', () => {
  it('accepts -180 (lower bound)', () => {
    expect(valdegree('-180')).toEqual({ ok: true, value: -180 });
  });

  it('accepts 0', () => {
    expect(valdegree('0')).toEqual({ ok: true, value: 0 });
  });

  it('accepts 180 (upper bound)', () => {
    expect(valdegree('180')).toEqual({ ok: true, value: 180 });
  });

  it('rejects -181 (below lower bound)', () => {
    expect(valdegree('-181')).toMatchObject({ ok: false, code: 'NUMOOR' });
  });

  it('rejects 181 (above upper bound)', () => {
    expect(valdegree('181')).toMatchObject({ ok: false, code: 'NUMOOR' });
  });

  it('rejects non-numeric input "abc"', () => {
    expect(valdegree('abc')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('rejects empty string', () => {
    expect(valdegree('')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('rejects float "90.5"', () => {
    expect(valdegree('90.5')).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

describe('valpcnt', () => {
  it('accepts 0 (lower default bound)', () => {
    expect(valpcnt('0')).toEqual({ ok: true, value: 0 });
  });

  it('accepts 99 (upper default bound)', () => {
    expect(valpcnt('99')).toEqual({ ok: true, value: 99 });
  });

  it('rejects -1 (below lower bound)', () => {
    expect(valpcnt('-1')).toMatchObject({ ok: false, code: 'NUMOOR' });
  });

  it('rejects 100 (above upper bound)', () => {
    expect(valpcnt('100')).toMatchObject({ ok: false, code: 'NUMOOR' });
  });

  it('rejects non-numeric "abc"', () => {
    expect(valpcnt('abc')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('rejects empty string', () => {
    expect(valpcnt('')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('accepts custom range min=0 max=6 with value 6', () => {
    expect(valpcnt('6', 0, 6)).toEqual({ ok: true, value: 6 });
  });

  it('rejects 7 with custom range max=6', () => {
    expect(valpcnt('7', 0, 6)).toMatchObject({ ok: false, code: 'NUMOOR' });
  });
});
