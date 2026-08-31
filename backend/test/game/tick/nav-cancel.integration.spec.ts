/**
 * T011 — manual STEERING silently cancels the autopilot.
 *
 * Originally every manual movement command cancelled it. Playing the game
 * showed that made the feature unusable: `nav` sets a course but no speed and
 * tells the pilot to set one, and doing so immediately cancelled the autopilot —
 * so it could never actually fly anyone anywhere. A speed order is not a
 * steering order.
 *
 * Contract now:
 *   - `rot <deg>` and `imp <pct> <course>` are steering orders and DO cancel
 *   - `war <n>` and `imp <pct>` are speed orders and do NOT
 *   - the cancel stays silent, and the command itself still takes effect
 *
 * @see docs/DECISIONS.md 2026-08-31 — autopilot survives a speed order
 * @see specs/016-navigation-spy/contracts/nav-command.md §manual-cancel (superseded)
 * @see GECMDS.C:643 cmd_rotate, :482 cmd_impulse, :561 cmd_warp
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CommandContext } from '../../../src/game/commands/command.types';

// Handler imports — rotate and impulse are plain commands (not @Injectable class),
// warp is an @Injectable service.
import { rotateCommand } from '../../../src/game/commands/handlers/rotate.handler';
import { impulseCommand } from '../../../src/game/commands/handlers/impulse.handler';
import { WarpHandlerService } from '../../../src/game/commands/handlers/warp.handler';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 50000,
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
    minesnear: 0, lock: 0, holdcourse: 1, topspeed: 5, warncntr: 0,
    navTargetX: 10, navTargetY: 8,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

// ---------------------------------------------------------------------------
// Helper: make a WarpHandlerService with a minimal ship class cache
// ---------------------------------------------------------------------------

function makeWarpHandler(): WarpHandlerService {
  const cache = new ShipClassCacheService({} as any);
  // Class 1 has warp capability
  cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10 });
  return new WarpHandlerService(cache);
}

// ---------------------------------------------------------------------------
// T011-A: rot command cancels autopilot
// ---------------------------------------------------------------------------

describe('rot command — cancels autopilot silently', () => {
  it('clears holdcourse, navTargetX, navTargetY after rot', () => {
    const ship = makeShip();
    rotateCommand.handler(ship, ['45'], ctx);
    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
    expect(ship.navTargetY).toBeNull();
  });

  it('rot command itself takes effect (degrees set)', () => {
    const ship = makeShip();
    rotateCommand.handler(ship, ['45'], ctx);
    expect(ship.degrees).toBe(45);
  });

  it('no nav-cancel event emitted (silent cancel)', () => {
    const ship = makeShip();
    const events = new EventEmitter2();
    const cancelListener = jest.fn();
    events.on('nav.cancelled', cancelListener);
    events.on('ship-management.nav-cancelled', cancelListener);

    rotateCommand.handler(ship, ['45'], ctx);
    expect(cancelListener).not.toHaveBeenCalled();
  });

  it('holdcourse was 0 → still 0 after rot (no spurious mutation)', () => {
    const ship = makeShip({ holdcourse: 0, navTargetX: null, navTargetY: null });
    rotateCommand.handler(ship, ['30'], ctx);
    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T011-B: imp command cancels autopilot
// ---------------------------------------------------------------------------

describe('imp command — cancels autopilot only when it steers', () => {
  it('imp with a COURSE clears holdcourse, navTargetX, navTargetY', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50', '30'], ctx);
    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
    expect(ship.navTargetY).toBeNull();
  });

  it('imp WITHOUT a course leaves the autopilot engaged', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50'], ctx);
    expect(ship.holdcourse).toBe(1);
    expect(ship.navTargetX).not.toBeNull();
  });

  it('imp command itself takes effect (speed2b set)', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50'], ctx);
    // impulse 50 → speed2b = 1000 * 50/100 = 500
    expect(ship.speed2b).toBe(500);
  });

  it('no nav-cancel event emitted (silent cancel)', () => {
    const ship = makeShip();
    const events = new EventEmitter2();
    const cancelListener = jest.fn();
    events.on('nav.cancelled', cancelListener);
    events.on('ship-management.nav-cancelled', cancelListener);

    impulseCommand.handler(ship, ['50'], ctx);
    expect(cancelListener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T011-C: war command cancels autopilot
// ---------------------------------------------------------------------------

describe('war command — a speed order, so the autopilot stays engaged', () => {
  it('leaves holdcourse and the nav target alone', () => {
    const ship = makeShip();
    const warpHandler = makeWarpHandler();
    warpHandler.command.handler(ship, ['3'], ctx);
    expect(ship.holdcourse).toBe(1);
    expect(ship.navTargetX).not.toBeNull();
    expect(ship.navTargetY).not.toBeNull();
  });

  it('war command itself takes effect (speed2b set to warp 3 = 3000 internal units)', () => {
    const ship = makeShip();
    const warpHandler = makeWarpHandler();
    warpHandler.command.handler(ship, ['3'], ctx);
    expect(ship.speed2b).toBe(3000);
  });

  it('no nav-cancel event emitted (silent cancel)', () => {
    const ship = makeShip();
    const events = new EventEmitter2();
    const cancelListener = jest.fn();
    events.on('nav.cancelled', cancelListener);
    events.on('ship-management.nav-cancelled', cancelListener);

    const warpHandler = makeWarpHandler();
    warpHandler.command.handler(ship, ['3'], ctx);
    expect(cancelListener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T011-D: parametrised table confirming all three cancel correctly
// ---------------------------------------------------------------------------

describe('autopilot cancel — parametrised table', () => {
  const warpHandler = makeWarpHandler();

  const cases = [
    {
      name: 'rot 30',
      dispatch: (ship: ShipState) => rotateCommand.handler(ship, ['30'], ctx),
      expectEffect: (ship: ShipState) => expect(ship.degrees).toBe(30),
    },
    {
      name: 'imp 50 30',
      dispatch: (ship: ShipState) => impulseCommand.handler(ship, ['50', '30'], ctx),
      expectEffect: (ship: ShipState) => expect(ship.speed2b).toBe(500),
    },
  ];

  // Speed-only orders keep the autopilot; they are covered by their own cases
  // above and in autopilot-persistence.spec.ts.

  it.each(cases)('$name → holdcourse cleared', ({ dispatch }) => {
    const ship = makeShip({ holdcourse: 1, navTargetX: 10, navTargetY: 8 });
    dispatch(ship);
    expect(ship.holdcourse).toBe(0);
  });

  it.each(cases)('$name → navTargetX cleared', ({ dispatch }) => {
    const ship = makeShip({ holdcourse: 1, navTargetX: 10, navTargetY: 8 });
    dispatch(ship);
    expect(ship.navTargetX).toBeNull();
  });

  it.each(cases)('$name → navTargetY cleared', ({ dispatch }) => {
    const ship = makeShip({ holdcourse: 1, navTargetX: 10, navTargetY: 8 });
    dispatch(ship);
    expect(ship.navTargetY).toBeNull();
  });

  it.each(cases)('$name → manual command takes effect', ({ dispatch, expectEffect }) => {
    const ship = makeShip({ holdcourse: 1, navTargetX: 10, navTargetY: 8 });
    dispatch(ship);
    expectEffect(ship);
  });
});
