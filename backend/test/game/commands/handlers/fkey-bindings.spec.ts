/**
 * `fset f1 pha 0 0`, then `f1` — typed function keys.
 *
 * PORT-ORIGINAL. Canon has no such feature and there is nothing to be
 * faithful to: on a BBS this lived in the TERMINAL. People bound F-keys in
 * Telix or Qmodem to transmit "pha 0 0\r", so GECMDS.C contains no key
 * handling at all.
 *
 * Typed rather than captured, because a browser cannot reliably claim the
 * F-keys — F11 and F12 never reach the page at all, F1/F3/F5/F6 are
 * inconsistent across browsers, and Ctrl+1..9 and Alt+1..9 both switch tabs.
 * A binding you TYPE works identically everywhere; a keypress can be layered
 * on later as a shortcut to the same thing.
 *
 * Named `fset` so it cannot collide with canon's `set`, which has its own
 * options (GECMDS.C:1892).
 *
 * It also removes a real class of error rather than just saving keystrokes:
 * the owner spent an hour firing `pha 100 1` because the first argument is a
 * DEGREE, not power. `fset f1 pha 0 0` is a thing you get right once.
 */
import { expandFkey, parseFsetArgs, FKEY_SLOTS } from '../../../../src/game/commands/fkeys';

describe('fset — binding a slot', () => {
  it('accepts f1 through f12', () => {
    expect(FKEY_SLOTS).toBe(12);
    for (let n = 1; n <= 12; n++) {
      expect(parseFsetArgs([`f${n}`, 'pha', '0', '0'])).toEqual({ ok: true, slot: n - 1, command: 'pha 0 0' });
    }
  });

  it('is case-insensitive on the slot name', () => {
    expect(parseFsetArgs(['F3', 'shi', 'up'])).toEqual({ ok: true, slot: 2, command: 'shi up' });
  });

  it('rejects a slot outside the range', () => {
    for (const bad of ['f0', 'f13', 'f', 'fx', '1', 'g1']) {
      expect(parseFsetArgs([bad, 'pha', '0', '0']).ok).toBe(false);
    }
  });

  it('clears a slot when given no command', () => {
    expect(parseFsetArgs(['f4'])).toEqual({ ok: true, slot: 3, command: '' });
  });

  it('keeps the whole command, spaces and all', () => {
    expect(parseFsetArgs(['f2', 'sca', 'lo', 'full'])).toEqual({ ok: true, slot: 1, command: 'sca lo full' });
  });

  it('refuses to bind a slot to itself', () => {
    // `fset f1 f1` would recurse forever on expansion.
    expect(parseFsetArgs(['f1', 'f1']).ok).toBe(false);
  });

  it('refuses to bind one slot to another', () => {
    // Chains are the same trap one step removed, and nothing needs them.
    expect(parseFsetArgs(['f1', 'f2']).ok).toBe(false);
  });
});

describe('expanding a bound slot', () => {
  const bindings = ['pha 0 0', '', 'sca lo full'];

  it('expands a bound slot to its command', () => {
    expect(expandFkey('f1', bindings)).toBe('pha 0 0');
    expect(expandFkey('f3', bindings)).toBe('sca lo full');
  });

  it('is case-insensitive', () => {
    expect(expandFkey('F1', bindings)).toBe('pha 0 0');
  });

  it('returns null for an unbound slot, so the router reports unknown command', () => {
    expect(expandFkey('f2', bindings)).toBeNull();
    expect(expandFkey('f9', bindings)).toBeNull();
  });

  it('leaves anything that is not a slot alone', () => {
    for (const q of ['pha', 'f', 'f0', 'f13', 'fset', 'flu']) {
      expect(expandFkey(q, bindings)).toBeNull();
    }
  });

  it('does not treat `flu` as f-something — three-char prefix matching must not reach it', () => {
    // `flu` is the flux command. A sloppy /^f(\d+)/ would not catch it, but a
    // sloppy startsWith('f') would.
    expect(expandFkey('flu', bindings)).toBeNull();
  });
});
