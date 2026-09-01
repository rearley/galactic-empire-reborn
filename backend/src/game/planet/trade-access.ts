/**
 * May this pilot trade at this planet at all?
 *
 * C runs these gates at the top of `cmd_buy` before any price or stock is
 * consulted (GECMDS.C:4232-4246 for the password, 4322 for ownership):
 *
 *   if (password == "team" && plptr->teamcode > 0
 *       && plptr->teamcode != waruptr->teamcode)      -> BUYPAS3, refuse
 *   else if (same test, teamcodes EQUAL)              -> BUYPAS4, welcome
 *   else if (password != "none" && a password given)  -> compare it
 *
 *   if (plptr->userid[0] != 0) { trade } else         -> BUY7
 *
 * The port never loaded the buyer's teamcode, so it refused whenever the
 * planet's teamcode was non-zero — locking a team's own members out of their
 * warehouse while leaving it open to everyone else — and it had no ownerless
 * check at all, so an abandoned planet stayed an open shop.
 */

export interface TradePlanet {
  userid: string | null;
  password: string;
  teamcode: bigint;
}

export type TradeAccess =
  | { ok: true; welcome?: true }
  | { ok: false; reason: 'NO_OWNER' | 'WRONG_TEAM' | 'BAD_PASSWORD' };

export function decideTradeAccess(
  planet: TradePlanet,
  buyerUserid: string,
  buyerTeamcode: bigint,
  providedPassword: string | undefined,
): TradeAccess {
  if (planet.userid === null) return { ok: false, reason: 'NO_OWNER' };

  // Your own planet asks you nothing.
  if (planet.userid === buyerUserid) return { ok: true };

  const password = planet.password ?? '';

  if (password === 'team' && planet.teamcode > 0n) {
    return planet.teamcode === buyerTeamcode
      ? { ok: true, welcome: true } // BUYPAS4
      : { ok: false, reason: 'WRONG_TEAM' }; // BUYPAS3
  }

  // A "team" password on a planet with no team assigned falls through to here
  // and gates nothing, exactly as C's `teamcode > 0` conditions leave it.
  if (password !== '' && password !== 'none' && password !== 'team') {
    if (providedPassword !== password) return { ok: false, reason: 'BAD_PASSWORD' };
  }

  return { ok: true };
}
