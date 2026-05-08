/**
 * T026 — Unit spec for ClsHandlerService.
 * Clears the frontend event log; pure handler with no backend mutation.
 * @see GECMDS.C:117 cmd_cls
 * @see specs/016-navigation-spy/tasks.md T026
 */
import { ClsHandlerService } from '../../../../src/game/commands/handlers/cls.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClsHandlerService', () => {
  const handler = new ClsHandlerService();

  it('returns { lines: [], clearLog: true }', () => {
    const ship = makeShip();
    const result = handler.command.handler(ship, [], {});
    expect(result).toEqual({ lines: [], clearLog: true });
  });

  it('does not mutate ship state', () => {
    const ship = makeShip({ energy: 12345, heading: 90 });
    // Capture a snapshot of primitive fields that a handler might mutate
    const snapshot = { energy: ship.energy, heading: ship.heading, speed: ship.speed, dirty: ship.dirty };
    handler.command.handler(ship, [], {});
    expect(ship.energy).toBe(snapshot.energy);
    expect(ship.heading).toBe(snapshot.heading);
    expect(ship.speed).toBe(snapshot.speed);
    expect(ship.dirty).toBe(snapshot.dirty);
  });

  it('accepts extra arguments silently — result is unchanged', () => {
    const ship = makeShip();
    const result = handler.command.handler(ship, ['extra', 'args'], {});
    expect(result).toEqual({ lines: [], clearLog: true });
  });

  it('result has no broadcast field', () => {
    const ship = makeShip();
    const result = handler.command.handler(ship, [], {}) as unknown as Record<string, unknown>;
    expect(result['broadcasts']).toBeUndefined();
  });

  it('command keyword is "cls" with minArgs 0', () => {
    expect(handler.command.keyword).toBe('cls');
    expect(handler.command.minArgs).toBe(0);
  });
});
