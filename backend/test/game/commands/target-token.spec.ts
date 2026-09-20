/**
 * `%t` in a `sen` message — "Hunting %t, all mine!"
 *
 * PORT-ORIGINAL. Canon's `cmd_send` rebuilds the line with `rstrin()` and
 * transmits it whole — GECMDS.C:1825 `void  FUNC cmd_send()` — and substitutes nothing, because on a BBS
 * the terminal did that sort of thing, if anyone did.
 *
 * The pure part lives here. It is pure on purpose: what the token expands to is
 * the whole feature, and it should be arguable without a socket.
 */
import { expandTargetToken, hasTargetToken } from '../../../src/game/commands/handlers/helpers/target-token';

describe('hasTargetToken', () => {
  it('finds the token anywhere in the line', () => {
    expect(hasTargetToken('Hunting %t, all mine!')).toBe(true);
    expect(hasTargetToken('%t')).toBe(true);
    expect(hasTargetToken('get off %t')).toBe(true);
  });

  it('accepts either case, because nobody remembers which it was', () => {
    expect(hasTargetToken('Hunting %T, all mine!')).toBe(true);
  });

  it('leaves an ordinary percent alone', () => {
    // Shields at 50%, a 100% loss — a chat line is allowed to contain a percent
    // sign without becoming a template.
    expect(hasTargetToken('shields at 50%')).toBe(false);
    expect(hasTargetToken('100% his fault')).toBe(false);
    expect(hasTargetToken('%')).toBe(false);
  });

  it('does not fire on another letter', () => {
    expect(hasTargetToken('%s %d %x')).toBe(false);
  });
});

describe('expandTargetToken', () => {
  it('puts the locked ship\'s name in', () => {
    const out = expandTargetToken('Hunting %t, all mine!', 'ICantStopDying');
    expect(out.ok).toBe(true);
    expect(out.ok && out.text).toBe('Hunting ICantStopDying, all mine!');
  });

  it('replaces every occurrence, not just the first', () => {
    const out = expandTargetToken('%t is mine. Say goodnight, %t.', 'SOBx942081');
    expect(out.ok && out.text).toBe('SOBx942081 is mine. Say goodnight, SOBx942081.');
  });

  it('refuses rather than sending a line with a hole in it', () => {
    // "Hunting , all mine!" going out to the whole galaxy is worse than being
    // told to lock something first.
    expect(expandTargetToken('Hunting %t, all mine!', null).ok).toBe(false);
  });

  it('refuses on a target whose name is empty', () => {
    // A hull with no name is not a name. Same hole, same refusal.
    expect(expandTargetToken('Hunting %t!', '').ok).toBe(false);
    expect(expandTargetToken('Hunting %t!', '   ').ok).toBe(false);
  });

  it('passes a line without the token straight through', () => {
    const out = expandTargetToken('nice shooting', null);
    expect(out.ok && out.text).toBe('nice shooting');
  });

  it('does not let a ship name inject another token', () => {
    // A pilot who renames their ship `%t` must not make the expansion recurse
    // or double-substitute on someone else's line.
    const out = expandTargetToken('Hunting %t!', '%t');
    expect(out.ok && out.text).toBe('Hunting %t!');
  });
});
