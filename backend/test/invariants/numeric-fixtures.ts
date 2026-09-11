/**
 * Reads integer fixture values out of a line of test source.
 *
 * Extracted from `fixture-domains.spec.ts`, which built the pattern inline.
 * @see numeric-fixtures.spec.ts for why the separator case is load-bearing.
 */
export interface FixtureNumber {
  /** The literal's value, separators removed. */
  value: number;
  /** Offset of the match within the line, for the scoped scan. */
  index: number;
}

// `[\\d_]+` rather than `\\d+`: JavaScript numeric separators are legal in a
// fixture and `\\d+` stops at the underscore, which read `topspeed: 8_000` as 8
// — a value INSIDE the canon domain, so the guard certified it instead of
// flagging it.
const pattern = (field: string): RegExp => new RegExp(`\\b${field}:\\s*(-?[\\d_]+)`, 'g');

export function fixtureNumbers(line: string, field: string): FixtureNumber[] {
  const out: FixtureNumber[] = [];
  for (const m of line.matchAll(pattern(field))) {
    out.push({ value: Number(m[1].replaceAll('_', '')), index: m.index });
  }
  return out;
}
