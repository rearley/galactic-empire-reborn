/**
 * `%t` in a `sen` message, expanded to the ship you have locked.
 *
 *   loc sh f
 *   sen a Hunting %t, all mine!
 *
 * PORT-ORIGINAL. Canon's `cmd_send` rebuilds the line with `rstrin()` and
 * transmits it whole — GECMDS.C:1825 `void  FUNC cmd_send()` — substituting nothing; on a BBS that sort
 * of thing belonged to the terminal, which is the same reason `fset` exists
 * here at all.
 *
 * Expanded in `sen` rather than in the f-key expansion, deliberately: doing it
 * here means it works the same whether the line was typed or came out of
 * `fset f4 sen a Hunting %t, all mine!`, and the router stays free of any
 * dependency on ship lookup.
 *
 * @see fkeys.ts, handlers/sen.handler.ts, docs/DECISIONS.md 2026-09-20
 */

/**
 * `%t` or `%T`, and nothing else.
 *
 * Bounded to the one letter on purpose. A chat line saying "shields at 50%" or
 * "100% his fault" is ordinary traffic and must not become a template, so a
 * bare `%` means nothing and no other letter is claimed. If a second token is
 * ever wanted, it gets its own letter and its own reason.
 */
const TOKEN_RE = /%t/gi;

export function hasTargetToken(message: string): boolean {
  // `lastIndex` is shared state on a /g/ regex — test() would advance it and
  // every other call would read a different answer for the same string.
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(message);
}

export type TargetTokenResult =
  | { ok: true; text: string }
  | { ok: false };

/**
 * Substitute the locked target's name, or refuse.
 *
 * Refusing matters more than it looks. "Hunting , all mine!" transmitted to the
 * whole galaxy is worse than being told to lock something first — the message
 * is gone, everyone has seen it, and the sender looks like they mistyped rather
 * than like the game declined.
 *
 * A line with no token passes through untouched, so this can sit in front of
 * every `sen` without caring whether the feature is being used.
 */
export function expandTargetToken(message: string, targetName: string | null): TargetTokenResult {
  if (!hasTargetToken(message)) return { ok: true, text: message };
  if (targetName == null || targetName.trim() === '') return { ok: false };

  // A function replacement, NOT a string one: `$&` and friends are special in
  // a string replacement, so a pilot who named their ship `$&` would corrupt
  // every line that named them. A function returns the name verbatim, which
  // also means a ship called `%t` substitutes once and stops rather than
  // seeding another expansion.
  TOKEN_RE.lastIndex = 0;
  return { ok: true, text: message.replace(TOKEN_RE, () => targetName) };
}
