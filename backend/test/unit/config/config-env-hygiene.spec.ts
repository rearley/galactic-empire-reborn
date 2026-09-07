import { resolveGameConfig } from '../../../src/game/config/game-config';

/**
 * Guards the input hygiene score.config.ts earned the hard way before its
 * settings were folded into the central manifest. Its comments record the
 * bugs: `parseInt('abc')` is NaN and NaN fails BOTH range comparisons, so a
 * non-numeric value slipped through and left the factor NaN — poisoning every
 * kill's arithmetic silently, with nothing thrown and nothing logged.
 *
 * The central loader must be at least as strict, or merging is a regression.
 */
const NO_FILE = { path: '/nonexistent/game.config.json' };

describe('central config: environment input hygiene', () => {
  it('rejects a non-numeric value rather than yielding NaN', () => {
    expect(() => resolveGameConfig({ ...NO_FILE, env: { SCRFACT: 'abc' } })).toThrow(/SCRFACT/);
  });

  it('rejects trailing garbage rather than silently truncating it', () => {
    // parseInt('12abc') is 12 — in range, so a typo became a live wrong value.
    expect(() => resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '12abc' } })).toThrow(/SCRFACT/);
  });

  it('treats a whitespace-only value as unset, not as zero', () => {
    // Number('   ') is 0. Read as a value, that silently switches the setting
    // off; read as "not configured", the canon default stands.
    const result = resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '   ' } });
    expect(result.SCRFACT).toBe(35);
  });

  it('treats an empty value as unset', () => {
    const result = resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '' } });
    expect(result.SCRFACT).toBe(35);
  });
});
