/**
 * You are not told that YOU de-cloaked.
 *
 *   warsptr->cloak = 0;
 *   prfmsg(CLOKOFF); outprfge(FILTER,usrnum);        // to you
 *   prfmsg(CLOK2);   outrange(FILTER,&warsptr->coord); // to everyone nearby
 *   -- GECMDS.C:3254-3259
 *
 * `outrange(filter, coordptr)` takes no `exclude` argument, but it excludes the
 * acting ship GEOMETRICALLY:
 *
 *   ddist = cdistance(coordptr,&wptr->coord) * 10000;
 *   if (ddist > 1 && ddist < scanrange) outprfge(filter,zothusn);
 *   -- GEMAIN.C outrange
 *
 * The de-cloaking ship sits at distance 0 from its own coordinate, so `ddist > 1`
 * skips it. The port broadcast to the sector room with no exclusion, so the
 * pilot was told "Sensors indicate a ship de-cloaking nearby Sir!" about
 * themselves, one line after "Cloaking device is now off, Sir!".
 *
 * Same family as the HYPERIN2 self-announcement fixed earlier today; reported
 * from play the same way.
 */

import { CloakHandlerService } from '../../../../src/game/commands/handlers/cloak.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'QuiteCat',
    shpclass: 2,
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 5,
    shieldtype: 4,
    cloak: 10,
    items: Array.from({ length: NUMITEMS }, () => 0n),
    topspeed: 20,
    ...over,
  });
}

describe('cloak off — the sector hears it, you do not (GECMDS.C:3258)', () => {
  it('excludes the de-cloaking ship from its own sector broadcast', async () => {
    const svc = new CloakHandlerService(
      {
        get: () => makeShip(),
        mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => fn(makeShip()),
      } as never,
      7500,
      { getHasCloak: () => true, get: () => ({ hasCloak: true }) } as never,
    );

    const res = await svc.command.handler(makeShip(), ['off'], {} as never);

    const sectorCast = (res.broadcasts ?? []).find((b) => b.room.startsWith('sector:'));
    expect(sectorCast).toBeDefined();
    expect(sectorCast!.excludeSelf).toBe(true);
  });
});
