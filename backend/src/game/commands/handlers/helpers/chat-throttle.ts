/**
 * How many messages one pilot may send inside {@link CHAT_WINDOW_MS}.
 *
 * Set far above conversation and far below a flood. Someone typing a considered
 * line manages one every few seconds; five inside five seconds is only reached
 * by pasting, and a script hits it on its second breath.
 */
export const CHAT_BURST = 5;

/** The window the burst is counted over. */
export const CHAT_WINDOW_MS = 5_000;

/**
 * Rolling-window rate limit for `sen`.
 *
 * PORT-ORIGINAL: canon throttles `send` not at all, because MajorBBS gave each
 * user one command per pass and a flood was not reachable from a terminal. Over
 * a socket it is — `sen.handler` makes no database call, so it completes
 * instantly and the per-socket command queue does nothing to slow it, and one
 * client could fill every other player's event log as fast as it could send.
 *
 * A refusal is deliberately NOT recorded: counting blocked attempts would let a
 * flood extend its own ban indefinitely, turning a rate limit into a punishment
 * the attacker controls the length of.
 *
 * @param history send timestamps still inside the window, oldest first
 * @param now current epoch milliseconds
 * @see docs/DECISIONS.md 2026-09-09
 */
export function allowChat(
  history: readonly number[],
  now: number,
): { allowed: boolean; history: number[] } {
  const live = history.filter((t) => now - t < CHAT_WINDOW_MS);
  if (live.length >= CHAT_BURST) return { allowed: false, history: live };
  return { allowed: true, history: [...live, now] };
}
