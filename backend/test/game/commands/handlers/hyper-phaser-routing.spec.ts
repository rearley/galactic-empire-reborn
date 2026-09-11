/**
 * The HYPER-phaser is chosen by where you ARE, not how fast you are going.
 *
 *   if (warsptr->where == 1) { ... firehp(warsptr,usrnum); }   -- GECMDS.C:843-851
 *
 * The port routed on `ship.speed >= WARP_THRESHOLD` instead. For a player the
 * two normally agree, because a player only reaches warp by accelerating
 * through the warp-1 boundary, which is the one thing that sets `where`. They
 * are still different tests, and they come apart for any hull whose speed was
 * assigned directly rather than accelerated into — which is exactly what
 * canon's Cybertron pursuit bands do (GECYBS.C:746, 761, 775).
 *
 * A ship at warp with `where === 0` must fire the ORDINARY phaser, which can
 * reach normal-space targets and, at phasrtype >= PHATOWRP, hyperspace ones
 * too. Routing it to `firehp` gave it a weapon that can only hit `where == 1`
 * and silently removed every normal-space target from its arc.
 *
 * @see GECMDS.C:843 the routing test
 * @see GECMDS.C:1042-1050 firehp's `wptr->where == 1` victim gate
 */

import { PhaserHandlerService } from '../../../../src/game/commands/handlers/phaser.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    items: Array.from({ length: NUMITEMS }, () => 0n),
    topspeed: 10,
    ...over,
  });
}

function build(ships: ShipState[]) {
  const svc = new PhaserHandlerService(
    {
      findAllShips: () => ships,
      findByName: () => undefined,
      findByUserid: () => [],
      get: () => undefined,
      mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
        const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
        if (s) fn(s);
      },
    } as never,
    {
      get: () => ({ scanRange: 100_000, maxTons: 1000 }),
      getMaxTons: () => 1000,
      getScanRange: () => 100_000,
    } as never,
    { emit: vi.fn() } as never,
    { next: () => 0.5 } as never,
  );
  return svc;
}

const isHyper = (r: { lines: Array<{ text: string }> }) =>
  r.lines.some((l) => /Hyper-phaser/i.test(l.text));

describe('hyper-phaser routing follows `where`, not speed (GECMDS.C:843)', () => {
  it('at warp but NOT in hyperspace, fires the ordinary phaser', async () => {
    const self = makeShip({ speed: 8000, where: 0 });
    const res = await build([self]).command.handler(self, ['0'], {} as never);

    expect(isHyper(res as never)).toBe(false);
  });

  it('in hyperspace, fires the hyper-phaser whatever the speed reads', async () => {
    const self = makeShip({ speed: 8000, where: 1 });
    const res = await build([self]).command.handler(self, ['0'], {} as never);

    expect(isHyper(res as never)).toBe(true);
  });
});
