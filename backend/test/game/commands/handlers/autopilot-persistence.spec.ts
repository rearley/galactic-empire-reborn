import { impulseCommand } from '../../../../src/game/commands/handlers/impulse.handler';
import { WarpHandlerService } from '../../../../src/game/commands/handlers/warp.handler';
import { rotateCommand } from '../../../../src/game/commands/handlers/rotate.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';

/**
 * `nav` points the ship and asks the pilot to set speed — and `war`/`imp` then
 * cancelled the autopilot on entry, unconditionally. Since nav sets no speed of
 * its own, the two were mutually exclusive: the autopilot could never actually
 * fly anyone anywhere. Setting a course and engaging is the only way to use it,
 * and doing so switched it off.
 *
 * A speed order is not a steering order. Only an explicit course change — or
 * `rot` — should take the helm back.
 */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Auto', shpclass: 1,
    heading: 90, head2b: 90, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 60000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 1, topspeed: 9, warncntr: 0,
    navTargetX: 8, navTargetY: 3,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const warp = new WarpHandlerService({ getMaxWarp: () => 9 } as unknown as ShipClassCacheService);


describe('autopilot survives a speed order', () => {
  it('warp keeps the course locked in', () => {
    const ship = makeShip();
    warp.command.handler(ship, ['4'], {});
    expect(ship.holdcourse).toBe(1);
    expect(ship.navTargetX).toBe(8);
    expect(ship.navTargetY).toBe(3);
  });

  it('impulse without a course keeps it too', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50'], {});
    expect(ship.holdcourse).toBe(1);
  });

  it('impulse WITH a course takes the helm back', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50', '30'], {});
    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
  });

  it('rot takes the helm back', () => {
    const ship = makeShip();
    rotateCommand.handler(ship, ['45'], {});
    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
  });

  it('a ship with no autopilot engaged is unaffected', () => {
    const ship = makeShip({ holdcourse: 0, navTargetX: null, navTargetY: null });
    warp.command.handler(ship, ['4'], {});
    expect(ship.holdcourse).toBe(0);
  });
});
