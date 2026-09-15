import { ShipState } from './ship-state.types';

/**
 * The `User` columns a live ship caches, as `UserRepository.getSessionProfile`
 * returns them and as the boot hydration's `include: { user: ... }` selects them.
 */
export interface SessionProfile {
  teamcode: bigint | null;
  options: number[];
  kills: number;
  username: string | null;
  fkeys: string[];
}

/**
 * Copies the captain's `User` row onto a freshly-mapped ship.
 *
 * `prismaShipToState` deliberately leaves these unset — none of them is a
 * `Ship` column, so the mapper cannot know them — which makes hydration the
 * CALLER's job. That arrangement has now failed twice in the same way, because
 * "every caller must remember" is not a mechanism:
 *
 *   - the mapper's own header records six earlier cases (maxTons, maxWarp, …)
 *   - on 2026-09-15 the first player to arrive from the Discord had the galaxy
 *     announce `Commanded by: usr_9d4ddc16…`, because `OnboardingService` put
 *     their first ship into the map without a profile. It self-heals on the
 *     next connection, so nobody already playing could ever have seen it.
 *
 * So there is now one function, and the three entry points call it: boot
 * hydration, boarding, and first-ship creation. A fourth caller gets the whole
 * set or none of it, rather than whichever fields its author remembered.
 *
 * Missing fields are left at their defaults rather than overwritten, so this is
 * safe to call with a partial or absent profile.
 *
 * @see display-name.ts — what an unset `username` does to a public message
 */
export function applySessionProfile(
  state: ShipState,
  profile: SessionProfile | null | undefined,
): void {
  if (profile?.teamcode != null) state.teamcode = profile.teamcode;
  // Canon names a player by their handle, not the account key. @see display-name.ts
  if (profile?.username) state.username = profile.username;
  if (profile?.fkeys) state.fkeys = profile.fkeys;
  // Cumulative captain kills — what the Cybertron escalation gates read.
  // Ship.kills is per-hull and resets on every replacement.
  // @see GECYBS.C:441, :524
  if (profile?.kills != null) state.userKills = profile.kills;
  state.scanNames = (profile?.options?.[0] ?? 0) === 1;
  state.scanHome = (profile?.options?.[1] ?? 0) === 1;
  state.scanFull = (profile?.options?.[2] ?? 0) === 1;
  state.msgFilter = (profile?.options?.[3] ?? 0) === 1;
}
