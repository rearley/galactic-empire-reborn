/**
 * How many simultaneous sockets one account may hold.
 *
 * Generous on purpose: a player with the game open in two tabs on a desktop and
 * one on a laptop is doing nothing wrong, and a reconnect can briefly overlap
 * with the socket it is replacing. The cap exists to stop an account opening
 * them without bound, not to police how someone plays.
 */
export const MAX_SOCKETS_PER_USER = 4;

/**
 * Which of an account's sockets to close now that another has connected.
 *
 * Every authenticated connection costs two Prisma queries and a slot in the
 * server's socket map, and nothing counted them per account: the MAXPLRS seat
 * cap bounds ships IN FLIGHT, not sockets before boarding, so an account that
 * never finishes selecting a ship could hold them open indefinitely.
 *
 * Oldest-first eviction, and never the arrival. Refusing the newcomer instead
 * would let a player's own stale tabs lock them out of their own account, which
 * turns a hardening measure into a denial of service against the person it is
 * meant to protect. Evicting is also the rule the game already uses for a
 * boarded ship — latest wins, SESSION_REPLACED — so this is that rule applied
 * once more rather than a second, different one.
 *
 * @param existing the account's current socket ids, oldest first
 * @param arriving the socket that has just connected
 * @returns socket ids to disconnect, oldest first; empty when under the cap
 * @see docs/audits/2026-09-09-security-review.md
 */
export function capSocketsForUser(existing: readonly string[], arriving: string): string[] {
  const others = existing.filter((id) => id !== arriving);
  const overBy = others.length + 1 - MAX_SOCKETS_PER_USER;
  return overBy > 0 ? others.slice(0, overBy) : [];
}
