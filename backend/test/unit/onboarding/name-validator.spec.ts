import { isValidShipName } from '../../../src/game/onboarding/name-validator';

describe('isValidShipName', () => {
  it('accepts a normal name', () => {
    expect(isValidShipName('Falcon')).toBe(true);
  });

  it('accepts a single character (minimum length)', () => {
    expect(isValidShipName('A')).toBe(true);
  });

  it('accepts 19 characters (maximum length)', () => {
    expect(isValidShipName('1234567890123456789')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidShipName('')).toBe(false);
  });

  it('rejects 20 characters (too long)', () => {
    expect(isValidShipName('12345678901234567890')).toBe(false);
  });

  it('rejects a name containing a space (0x20)', () => {
    expect(isValidShipName('hello world')).toBe(false);
  });

  it('rejects a name containing a control character (0x00)', () => {
    expect(isValidShipName('\x00name')).toBe(false);
  });

  it('rejects a name containing a tab', () => {
    expect(isValidShipName('hello\tworld')).toBe(false);
  });

  it('accepts tilde (~ = 0x7E, valid upper boundary)', () => {
    expect(isValidShipName('~valid~')).toBe(true);
  });

  it('accepts exclamation mark (! = 0x21, valid lower boundary)', () => {
    expect(isValidShipName('!valid!')).toBe(true);
  });

  it('accepts a name with a hyphen (printable ASCII)', () => {
    expect(isValidShipName('Falcon-9')).toBe(true);
  });

  it('rejects DEL character (0x7F, not printable)', () => {
    expect(isValidShipName('\x7F')).toBe(false);
  });
});
