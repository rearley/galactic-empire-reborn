/**
 * You cannot drop into orbit from hyperspace.
 *
 *   if (warsptr->where == 1) { prfmsg(ORBIT4); outprfge(ALWAYS,usrnum); return; }
 *
 * @see GECMDS.C:770-774 — the gate sits above the already-in-orbit test and
 *      above any planet lookup, so it is the first thing `orb` answers for a
 *      ship at warp.
 *
 * ORBIT4 is "We cannot obtain an orbit from hyperspace Sir!" (MBMGEMSG.MSG).
 * The port had no such gate: a captain at warp passing within 250 units of a
 * planet dropped into orbit mid-flight, and the handler then zeroed speed and
 * speed2b — a free emergency stop from any velocity.
 */
import { OrbitHandlerService } from '../../src/game/commands/handlers/orbit.handler';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants/items';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20.5, ycoord: 20.5, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function build() {
  const planetService = {
    bySector: () => [{ plnum: 1, name: 'Target', xcoord: 20.5, ycoord: 20.5, type: 1, userid: null }],
  } as unknown as PlanetStateService;
  const shipState = {
    mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => fn(makeShip()),
  } as unknown as ShipStateService;
  return new OrbitHandlerService(shipState, planetService, {} as never);
}

const ctx: CommandContext = {};

describe('orb from hyperspace (GECMDS.C:770)', () => {
  it('refuses with ORBIT4 when the ship is in hyperspace', async () => {
    const res = await build().command.handler(makeShip({ where: 1 }), [], ctx) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.ORBIT_HYPERSPACE));
  });

  it('does not silently stop the ship', async () => {
    // The port's orbit path zeroes speed and speed2b. Refusing must not.
    const ship = makeShip({ where: 1, speed: 25_000, speed2b: 25_000 });

    await build().command.handler(ship, [], ctx);

    expect({ speed: ship.speed, where: ship.where }).toEqual({ speed: 25_000, where: 1 });
  });

  it('still refuses a ship already in orbit with the other message', async () => {
    const res = await build().command.handler(makeShip({ where: 11 }), [], ctx) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.ORBITALR));
  });
});
