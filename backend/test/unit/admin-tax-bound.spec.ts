import { parseTaxRate, TAXRATE_MAX } from '../../src/game/commands/handlers/helpers/tax-rate';

/**
 * `adm tax 150` answered "Setting saved." and stored 119. The handler did
 * `Math.min(119, value)` before validation, so the service's own range check
 * could never fire and the command confirmed a value it had not saved — while
 * every sibling setter (`adm rate`, `adm markup`, `adm reserve`) rejects
 * out-of-range input with "Invalid value."
 *
 * C rejects too, and its ceiling is 100, not 119:
 *   `if (margc == 1 && amt <= 100) { plptr->taxrate = amt; ... }`
 *   else prfmsg(ADMENU2H)   — GEMAIN.C:3224 mnu_admenu2h
 *
 * The port's 119 came from spec 005 ("preserves taxfact > 0", i.e. below the
 * 120 divisor in the revolt formula) rather than from the setter C actually
 * ships. Superseded there; this pins C's number.
 */
describe('parseTaxRate', () => {
  it('uses C\'s ceiling of 100, not the divisor-derived 119', () => {
    expect(TAXRATE_MAX).toBe(100);
  });

  it('accepts the range C accepts', () => {
    expect(parseTaxRate('0')).toEqual({ ok: true, value: 0 });
    expect(parseTaxRate('60')).toEqual({ ok: true, value: 60 });
    expect(parseTaxRate('100')).toEqual({ ok: true, value: 100 });
  });

  it('REJECTS above the ceiling instead of silently clamping', () => {
    expect(parseTaxRate('101')).toEqual({ ok: false });
    expect(parseTaxRate('119')).toEqual({ ok: false });
    expect(parseTaxRate('150')).toEqual({ ok: false });
  });

  it('rejects negatives and nonsense, like its sibling setters', () => {
    expect(parseTaxRate('-1')).toEqual({ ok: false });
    expect(parseTaxRate('lots')).toEqual({ ok: false });
    expect(parseTaxRate('')).toEqual({ ok: false });
  });
});
