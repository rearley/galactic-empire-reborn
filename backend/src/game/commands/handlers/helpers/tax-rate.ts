/**
 * Highest tax rate a colony may be set to.
 *
 * `if (margc == 1 && amt <= 100) { plptr->taxrate = amt; ... }` — C caps at
 * 100 and re-prompts otherwise (GEMAIN.C:3224 mnu_admenu2h).
 *
 * The port used 119, derived in spec 005 from the revolt formula's `/120`
 * divisor rather than from the setter C ships. The divisor explains why the
 * rate must stay below 120; it is not evidence that C let you set 119.
 */
export const TAXRATE_MAX = 100;

export type TaxRate = { ok: true; value: number } | { ok: false };

/**
 * Reads an `adm tax` argument.
 *
 * The handler used to `Math.min(TAXRATE_MAX, value)` before validating, so an
 * out-of-range rate was silently clamped and then confirmed as "Setting
 * saved." — the command reporting a value it had not stored, and the only
 * `adm` setter that did not simply refuse bad input.
 */
export function parseTaxRate(input: string): TaxRate {
  const raw = (input ?? '').trim();
  if (!/^\d+$/.test(raw)) return { ok: false };
  const value = parseInt(raw, 10);
  if (value < 0 || value > TAXRATE_MAX) return { ok: false };
  return { ok: true, value };
}
