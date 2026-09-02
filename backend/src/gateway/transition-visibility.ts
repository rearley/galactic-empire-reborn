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
 * Player transitions remain public: `who` already lists every player's sector,
 * and the client's player panel is driven by this event.
 */
export function shouldBroadcastTransition(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status !== GESTAT_AUTO;
}
