import { isAiUserid } from '../../../../src/game/commands/helpers/ai-userid';

describe('isAiUserid', () => {
  it('returns true for Cybrg- prefix (Cybertron)', () => {
    expect(isAiUserid('Cybrg-42')).toBe(true);
  });

  it('returns true for Cybrg- with numeric id', () => {
    expect(isAiUserid('Cybrg-1764')).toBe(true);
  });

  it('returns true for @Droid- prefix', () => {
    expect(isAiUserid('@Droid-0001')).toBe(true);
  });

  it('returns true for @Droid- with large id', () => {
    expect(isAiUserid('@Droid-9999')).toBe(true);
  });

  it('returns false for plain human userid', () => {
    expect(isAiUserid('admiral')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAiUserid('')).toBe(false);
  });

  it('returns false for Droid- without @ (not a real prefix)', () => {
    expect(isAiUserid('Droid-001')).toBe(false);
  });

  it('returns false for userid that starts with a similar but different prefix', () => {
    expect(isAiUserid('Cybrg')).toBe(false);
  });

  it('returns false for userid containing Cybrg- in the middle', () => {
    expect(isAiUserid('user-Cybrg-5')).toBe(false);
  });
});
