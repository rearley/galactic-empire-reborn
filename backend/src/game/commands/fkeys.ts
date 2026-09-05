/**
 * Typed function-key bindings: `fset f1 pha 0 0`, then `f1`.
 *
 * PORT-ORIGINAL — canon has no equivalent and there is nothing to be faithful
 * to. On a BBS this lived in the TERMINAL: people bound F-keys in Telix or
 * Qmodem to transmit "pha 0 0\r", so GECMDS.C has no key handling at all.
 *
 * Typed rather than captured, because a browser cannot reliably claim the
 * F-keys — F11 and F12 never reach the page, F1/F3/F5/F6 vary by browser, and
 * both Ctrl+1..9 and Alt+1..9 switch tabs. A binding you TYPE behaves the same
 * everywhere; a real keypress can be layered on later as a shortcut to it.
 *
 * Named `fset` so it cannot collide with canon's `set` (GECMDS.C:1892).
 *
 * @see docs/DECISIONS.md
 */

/** f1..f12. Twelve because that is what a keyboard has, not because canon says so. */
export const FKEY_SLOTS = 12;

/** `f1`..`f12` and nothing else — `flu` and `fset` must not match. */
const SLOT_RE = /^f([1-9]|1[0-2])$/i;

export type FsetParse =
  | { ok: true; slot: number; command: string }
  | { ok: false };

/**
 * Parse `fset <slot> [command...]`. An empty command clears the slot.
 *
 * Binding a slot to a slot is refused: `fset f1 f1` would recurse on
 * expansion, and `fset f1 f2` is the same trap one step removed. Nothing needs
 * chains, so the whole shape is rejected rather than depth-limited.
 */
export function parseFsetArgs(args: readonly string[]): FsetParse {
  const m = SLOT_RE.exec((args[0] ?? '').trim());
  if (!m) return { ok: false };

  const command = args.slice(1).join(' ').trim();
  if (command !== '' && SLOT_RE.test(command.split(/\s+/)[0] ?? '')) return { ok: false };

  return { ok: true, slot: Number(m[1]) - 1, command };
}

/**
 * The command a slot is bound to, or null.
 *
 * Null for an unbound slot as well as for a non-slot, so the router reports
 * "unknown command" either way — pressing an empty slot should not silently
 * do nothing.
 */
export function expandFkey(word: string, bindings: readonly string[]): string | null {
  const m = SLOT_RE.exec(word.trim());
  if (!m) return null;
  const bound = bindings[Number(m[1]) - 1];
  return bound != null && bound !== '' ? bound : null;
}
