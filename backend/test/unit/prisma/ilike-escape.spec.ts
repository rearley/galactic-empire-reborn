import { escapeIlikePattern } from '../../../src/prisma/ilike-escape';

describe('escapeIlikePattern', () => {
  it('leaves ordinary text untouched', () => {
    expect(escapeIlikePattern('Falcon')).toBe('Falcon');
  });

  it('escapes % so it cannot act as a wildcard', () => {
    expect(escapeIlikePattern('%')).toBe('\\%');
    expect(escapeIlikePattern('abc%def')).toBe('abc\\%def');
  });

  it('escapes _ so it cannot act as a single-character wildcard', () => {
    expect(escapeIlikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes a literal backslash first, so it cannot re-activate an escape', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b');
    // A naive "escape % and _ only" implementation would turn `\%` into a
    // pattern that Postgres reads as an escaped, LITERAL `%` — not what the
    // caller supplied. Escaping the backslash itself first prevents that.
    expect(escapeIlikePattern('\\%')).toBe('\\\\\\%');
  });
});
