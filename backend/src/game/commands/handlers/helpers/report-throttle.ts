/**
 * How many bug reports one ship may file inside {@link REPORT_WINDOW_MS}.
 *
 * Two, because the second one is usually a detail the player forgot and
 * refusing it teaches them not to bother. The tenth is a script or somebody
 * venting, and every report is a row a human reads.
 */
export const REPORT_BURST = 2;

/** The window the burst is counted over. */
export const REPORT_WINDOW_MS = 60_000;

/**
 * Rolling-window rate limit for `bug`, the same shape as `allowChat`.
 *
 * A refusal is NOT recorded, for the same reason it is not there: counting
 * blocked attempts lets a flood extend its own ban indefinitely, turning a rate
 * limit into a punishment whose length the attacker chooses.
 *
 * @see helpers/chat-throttle.ts
 */
export function allowReport(
  history: readonly number[],
  now: number,
): { allowed: boolean; history: number[] } {
  const live = history.filter((t) => now - t < REPORT_WINDOW_MS);
  if (live.length >= REPORT_BURST) return { allowed: false, history: live };
  return { allowed: true, history: [...live, now] };
}
