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

  /**
   * Canon renames with `rstrin(); strncpy(shipname, margv[1], 19)`
   * (GECMDS.C:5002-5010). `rstrin()` restores the input line the tokeniser
   * split, so `margv[1]` runs to the end of it — that is the MajorBBS idiom
   * for "the rest of the line", and `cmd_send` uses the same trick to send a
   * message rather than a single word.
   *
   * So an interior space is legal and always was. The port rejected it, and
   * `ren BigCat II` silently produced "BigCat".
   */
  it('accepts an interior space — canon takes the rest of the line', () => {
    expect(isValidShipName('BigCat II')).toBe(true);
    expect(isValidShipName('The Black Pearl')).toBe(true);
  });

  it('rejects leading or trailing space, which canon never produces', () => {
    // The handler trims before validating, so a name arriving here padded is a
    // caller bug rather than a user one.
    expect(isValidShipName(' BigCat')).toBe(false);
    expect(isValidShipName('BigCat ')).toBe(false);
    expect(isValidShipName('   ')).toBe(false);
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
