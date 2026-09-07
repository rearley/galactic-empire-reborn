import { clearToken } from './tokenStore';
import { socket } from '../socket/socketClient';

/**
 * End the session: drop the token, close the socket, return to the front door.
 *
 * Offered ONLY from the ship-select menu and the public header — never from the
 * live terminal. Closing the socket is canon's warhupa (GEMAIN.C:1397), which
 * destroys the hull when cantexit > 0. Reaching ship-select means `x` already
 * ran and enforced cantexit itself, answering CANTEXT when it could not.
 *
 * This mirrors canon's own two levels: `x` leaves Galactic Empire for the menu
 * (GEMAIN.C:2859 mnu_fightsub); logging off the BBS was a separate action.
 *
 * @param assign injected for tests; defaults to a real navigation.
 */
export function logout(assign: (url: string) => void = (url) => window.location.assign(url)): void {
  clearToken();
  try {
    socket?.disconnect();
  } catch {
    // A socket already closed is the normal case from ship-select. Never let it
    // block the navigation — a logout that half-runs is worse than either end.
  }
  assign('/');
}
