import { parseTeaArgs, validateName, validatePassword } from '../../src/game/team/team-name';

describe('parseTeaArgs', () => {
  it('returns usage error for 0 tokens', () => {
    expect(parseTeaArgs([])).toEqual({ error: 'usage' });
  });

  it('returns usage error for 1 token', () => {
    expect(parseTeaArgs(['password'])).toEqual({ error: 'usage' });
  });

  it('parses 2 tokens: single-word name + password', () => {
    expect(parseTeaArgs(['Raiders', 's3cret'])).toEqual({ name: 'Raiders', password: 's3cret' });
  });

  it('parses 3+ tokens: multi-word name + last token as password', () => {
    expect(parseTeaArgs(['Galactic', 'Raiders', 's3cret'])).toEqual({ name: 'Galactic Raiders', password: 's3cret' });
  });

  it('joins multiple name tokens with single spaces', () => {
    expect(parseTeaArgs(['The', 'Red', 'Fleet', 'pw'])).toEqual({ name: 'The Red Fleet', password: 'pw' });
  });

  it('trims leading/trailing whitespace from resulting name', () => {
    const result = parseTeaArgs(['  Foo  ', 'pw']);
    expect(result).toEqual({ name: 'Foo', password: 'pw' });
  });

  it('all-whitespace name returns usage error', () => {
    expect(parseTeaArgs(['   ', 's3cret'])).toEqual({ error: 'usage' });
  });

  it('preserves internal spacing within name tokens as joined', () => {
    expect(parseTeaArgs(['Galactic', 'Raiders', 'pw'])).toEqual({ name: 'Galactic Raiders', password: 'pw' });
  });
});

describe('validateName', () => {
  it('returns null for a 29-char name', () => {
    expect(validateName('a'.repeat(29))).toBeNull();
  });

  it('returns null for exactly 30-char name', () => {
    expect(validateName('a'.repeat(30))).toBeNull();
  });

  it('returns name_too_long for 31-char name', () => {
    expect(validateName('a'.repeat(31))).toBe('name_too_long');
  });
});

describe('validatePassword', () => {
  it('returns null for a valid 8-char password', () => {
    expect(validatePassword('s3cret00')).toBeNull();
  });

  it('returns null for a 1-char password', () => {
    expect(validatePassword('x')).toBeNull();
  });

  it('returns password_too_long for 9-char password', () => {
    expect(validatePassword('123456789')).toBe('password_too_long');
  });

  it('returns password_has_space for password with space (≤ 8 chars)', () => {
    expect(validatePassword('a b')).toBe('password_has_space');
  });

  it('returns password_has_space for password with tab (≤ 8 chars)', () => {
    expect(validatePassword('a\tb')).toBe('password_has_space');
  });

  it('returns null for empty string (length 0 — not our job to reject blanks here)', () => {
    // parser guarantees non-blank; validator only checks length+whitespace
    expect(validatePassword('')).toBeNull();
  });
});
