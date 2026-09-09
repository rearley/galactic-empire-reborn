import { GESTAT_AUTO } from '../game/constants';

/**
 * Whether a sector transition should be published to all clients.
 *
 * The event used to go out unconditionally via `server.emit`, so every client
 * received a live position feed for all 24 Cybertrons and every droid. `who`
 * deliberately hides AI for exactly this reason — "listing every live ship
 * printed all 24 Cybertrons with their exact sectors, so a pilot could route
 * around them" — and the scan commands are the intended way to find one.
 *
 * Player transitions are no longer public either. `who` stopped publishing
 * player sectors — canon reveals a live player's position through `sca` alone,
 * range-gated and announcing itself to the target — so this event now goes to
 * the MOVER only, whose scan map clears on it. The player panel is driven by
 * `player.sector`, whose audience the gateway scopes per sector.
 *
 * This gate therefore reads as a second lock rather than the only one: an AI
 * has no socket to send to, but nothing should depend on that staying true.
 * @see gateway/player-visibility.ts, game/ship/sector-visibility.ts
 */
export function shouldBroadcastTransition(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status !== GESTAT_AUTO;
}
