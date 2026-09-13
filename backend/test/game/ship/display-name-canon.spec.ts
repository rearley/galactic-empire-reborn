/**
 * Canon's `username()` decides what a ship is CALLED in public messages.
 *
 *   char *username(WARSHP *ptr)
 *   {
 *     if (CLASSTYPE_CYBORG) return ptr->shipname;
 *     if (CLASSTYPE_DROID)  return ptr->shipname;
 *     return ptr->userid;
 *   }
 *   -- GEFUNCS.C:2596
 *
 * So AI is named by its HULL and a player by their HANDLE. It is used for the
 * galaxy-wide kill announcement (KILLEDBY), for `sca sh`'s "Commanded by:",
 * and for the scan-detection notices.
 *
 * The port printed `ptr->userid` literally — and our `userid` is a synthetic
 * primary key, not a login name. Canon's userid WAS the BBS handle, so the
 * field was right and the value was not. A player watched the galaxy announce:
 *
 *   Commander @Droid-1's ship was destroyed by usr_27523ed6401c4e990dd98be2!!!
 *
 * Our equivalent of canon's handle is `User.username`, so ShipState caches it
 * the same way `teamcode` and `userKills` are cached — hydrated at boot and at
 * board time, never persisted on Ship.
 */
import { displayName } from '../../../src/game/ship/display-name';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'usr_27523ed6401c4e990dd98be2',
    shipname: 'WildCat',
    energy: 0,
    phasrtype: 1,
    shieldtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 8,
    ...over,
  });
}

describe("canon's username()", () => {
  it('names a player by their handle, never by the account key', () => {
    const ship = makeShip({ username: 'Vraskbane' });
    expect(displayName(ship)).toBe('Vraskbane');
    expect(displayName(ship)).not.toContain('usr_');
  });

  it('names a Cybertron by its HULL, as CLASSTYPE_CYBORG does', () => {
    const cyb = makeShip({ userid: 'Cybrg-221', shipname: 'Cybertron 43363', status: 2, shpclass: 21 });
    expect(displayName(cyb)).toBe('Cybertron 43363');
  });

  it('names a droid by its hull too', () => {
    const droid = makeShip({ userid: '@Droid-1', shipname: 'NCC Lx470', status: 2, shpclass: 31 });
    expect(displayName(droid)).toBe('NCC Lx470');
  });

  it('falls back to the id only when no handle has been hydrated', () => {
    // A player hull whose User row has not been joined yet. Ugly, but it must
    // never throw or print "undefined" into a galaxy-wide broadcast.
    expect(displayName(makeShip())).toBe('usr_27523ed6401c4e990dd98be2');
  });

  it('prefers the hull for AI even when a handle somehow exists', () => {
    const cyb = makeShip({ shipname: 'Cybertron 1', status: 2, shpclass: 22, username: 'leaked' });
    expect(displayName(cyb)).toBe('Cybertron 1');
  });
});
