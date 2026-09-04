import { ShipState } from './ship-state.types';
import { GESTAT_AUTO } from '../constants';

/**
 * What a ship is CALLED in public messages — canon's `username()`.
 *
 *   char *username(WARSHP *ptr)
 *   {
 *     if (CLASSTYPE_CYBORG) return ptr->shipname;
 *     if (CLASSTYPE_DROID)  return ptr->shipname;
 *     return ptr->userid;
 *   }
 *   @see GEFUNCS.C:2596
 *
 * AI is named by its HULL, a player by their HANDLE. Used by the galaxy-wide
 * kill announcement (KILLEDBY), `sca sh`'s "Commanded by:", and the
 * scan-detection notices.
 *
 * The port printed `userid` literally, and OUR userid is a synthetic primary
 * key rather than canon's BBS login name — so the field was right and the
 * value was not. A player watched the galaxy announce their account key:
 *
 *   Commander @Droid-1's ship was destroyed by usr_27523ed6401c4e990dd98be2!!!
 *
 * `ShipState.username` caches `User.username` the way `teamcode` and
 * `userKills` are cached. The userid fallback exists so a hull whose User row
 * has not been joined yet cannot put "undefined" into a broadcast.
 *
 * Status, not class, decides AI here: `GESTAT_AUTO` is what both Cybertrons and
 * droids carry, and it is the same test the combat paths use.
 */
export function displayName(ship: Pick<ShipState, 'userid' | 'shipname' | 'status' | 'username'>): string {
  if (ship.status === GESTAT_AUTO) return ship.shipname;
  return ship.username ?? ship.userid;
}
