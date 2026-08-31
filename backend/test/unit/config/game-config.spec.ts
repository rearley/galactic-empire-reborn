/**
 * Sysop option registry + loader.
 *
 * The original exposed 51 tunables through `numopt(NAME, min, max)` read at
 * boot from a sysop `.cnf` (GEMAIN.C:459-524). The value itself is NOT canon —
 * it was each sysop's taste — but the CLAMP BOUNDS are: a value outside them is
 * one the original could never produce.
 *
 * That distinction is the point of centralising this. Three defects this
 * session (TDAMMAX 200 vs a ceiling of 100, MDAMMAX 300 vs 100, JAMTIME 20 vs
 * 10) were values the original cannot generate, and each was caught only by
 * writing a test after the fact. Routing every option through one clamped
 * loader makes an out-of-bounds value structurally impossible instead.
 */

import { SYSOP_OPTIONS, loadGameConfig, flattenConfigFile, resolveGameConfig } from '../../../src/game/config/game-config';

describe('sysop option registry', () => {
  it('declares every numopt option found in the C source', () => {
    expect(Object.keys(SYSOP_OPTIONS)).toHaveLength(51);
  });

  it('records the C clamp bounds for each option', () => {
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      expect(typeof spec.min).toBe('number');
      expect(typeof spec.max).toBe('number');
      expect(spec.min).toBeLessThanOrEqual(spec.max);
      expect(spec.cReference).toMatch(/^GEMAIN\.C:\d+$/);
      expect(name).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('every default sits inside its own bounds', () => {
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(name).toBeTruthy();
    }
  });

  it('pins the bounds that were violated before this existed', () => {
    expect(SYSOP_OPTIONS.TDAMMAX.max).toBe(100);
    expect(SYSOP_OPTIONS.MDAMMAX.max).toBe(100);
    expect(SYSOP_OPTIONS.JAMTIME.max).toBe(10);
    expect(SYSOP_OPTIONS.PDAMMAX.max).toBe(200);
  });
});

describe('loadGameConfig', () => {
  it('returns the declared defaults when given nothing', () => {
    const cfg = loadGameConfig({ file: {}, env: {} });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
    expect(cfg.TDAMMAX).toBe(SYSOP_OPTIONS.TDAMMAX.default);
  });

  it('applies file values over defaults', () => {
    const cfg = loadGameConfig({ file: { PDAMMAX: 40 }, env: {} });
    expect(cfg.PDAMMAX).toBe(40);
  });

  it('lets env override the file — docker-compose must win', () => {
    const cfg = loadGameConfig({ file: { PDAMMAX: 40 }, env: { PDAMMAX: '55' } });
    expect(cfg.PDAMMAX).toBe(55);
  });

  it('CLAMPS above the maximum instead of accepting an impossible value', () => {
    // This is the TDAMMAX=200 defect, now structurally prevented.
    const cfg = loadGameConfig({ file: { TDAMMAX: 200 }, env: {} });
    expect(cfg.TDAMMAX).toBe(100);
  });

  it('clamps below the minimum too', () => {
    const cfg = loadGameConfig({ file: { JAMTIME: 0 }, env: {} });
    expect(cfg.JAMTIME).toBe(1);
  });

  it('reports what it clamped, so a bad config is visible rather than silent', () => {
    const { warnings } = loadGameConfig({ file: { TDAMMAX: 200 }, env: {} }, { collectWarnings: true });
    expect(warnings.join(' ')).toMatch(/TDAMMAX/);
    expect(warnings.join(' ')).toMatch(/200/);
    expect(warnings.join(' ')).toMatch(/100/);
  });

  it('rejects an unknown option rather than ignoring a typo', () => {
    expect(() => loadGameConfig({ file: { PDAMMMAX: 40 }, env: {} })).toThrow(/PDAMMMAX/);
  });

  it('rejects a non-numeric value', () => {
    expect(() => loadGameConfig({ file: { PDAMMAX: 'lots' as unknown as number }, env: {} })).toThrow(/PDAMMAX/);
  });

  it('ignores unrelated environment variables', () => {
    const cfg = loadGameConfig({ file: {}, env: { PATH: '/usr/bin', NODE_ENV: 'test' } });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
  });

  it('marks which options are actually wired into gameplay', () => {
    // 25 of the 51 back a live constant today; the rest are declared so the
    // bounds are recorded and the gap is visible.
    const wired = Object.values(SYSOP_OPTIONS).filter((s) => s.implemented);
    expect(wired.length).toBe(25);
  });

  it('DECODDS is config-driven now that decoyIntercept uses the C 1-in-N form', () => {
    // The port used to read decodds as a 0-100 percentage, which made it
    // incomparable to the C bound of 1..20 and forced a special case here.
    // decoyIntercept now rolls gernd()%decodds==0 like C, so the option is
    // ordinary: default 2 reproduces the old 50% intercept exactly.
    expect(SYSOP_OPTIONS.DECODDS.implemented).toBe(true);
    expect(SYSOP_OPTIONS.DECODDS.default).toBe(2);
    expect(SYSOP_OPTIONS.DECODDS.max).toBe(20);
  });
});

describe('flattenConfigFile', () => {
  it('flattens the grouped on-disk shape into option names', () => {
    const flat = flattenConfigFile({
      weapons: { PDAMMAX: 30, TDAMMAX: 90 },
      world: { UNIVMAX: 20 },
    });
    expect(flat).toEqual({ PDAMMAX: 30, TDAMMAX: 90, UNIVMAX: 20 });
  });

  it('accepts an already-flat file', () => {
    expect(flattenConfigFile({ PDAMMAX: 30 })).toEqual({ PDAMMAX: 30 });
  });

  it('rejects a duplicated option across two groups', () => {
    expect(() =>
      flattenConfigFile({ weapons: { PDAMMAX: 30 }, limits: { PDAMMAX: 40 } }),
    ).toThrow(/PDAMMAX/);
  });

  it('returns an empty object for an empty file', () => {
    expect(flattenConfigFile({})).toEqual({});
  });
});

describe('resolveGameConfig', () => {
  it('works with no config file present, falling back to declared defaults', () => {
    const cfg = resolveGameConfig({ path: '/nonexistent/game.config.json', env: {} });
    expect(cfg.PDAMMAX).toBe(SYSOP_OPTIONS.PDAMMAX.default);
  });

  it('reads the repository config file and every value is inside its bounds', () => {
    const cfg = resolveGameConfig({ env: {} });
    for (const [name, spec] of Object.entries(SYSOP_OPTIONS)) {
      const value = cfg[name as keyof typeof cfg];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });

  it('the shipped config file needs no clamping — it is already valid', () => {
    expect(resolveGameConfig({ env: {} }).warnings).toEqual([]);
  });
});
