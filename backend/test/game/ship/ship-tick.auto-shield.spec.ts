/**
 * T022 — ShipTickService auto-shield integration tests (US4).
 * Verifies that decideAutoShield results are applied to ship state,
 * trigger flags are cleared on raise, and conditions are checked.
 * @see backend/src/game/ship/ship-tick.service.ts ShipTickService
 * @see specs/019-physics-polish/spec.md US4, FR-006
 */
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
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

function makeHarness(ship: ShipState) {
  let capturedHandler: ((ctx: TickContext) => void) | null = null;
  const mutatedState = { ...ship } as ShipState;

  const mockTickService = {
    subscribe: jest.fn().mockImplementation((_kind: TickKind, h: (ctx: TickContext) => void) => {
      capturedHandler = h;
      return jest.fn();
    }),
  } as unknown as TickService;

  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue([ship]),
    mutate: jest.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      fn(mutatedState);
    }),
  } as unknown as ShipStateService;

  const mockMaintService = {
    runAutoRepair: jest.fn().mockResolvedValue(undefined),
  } as unknown as MaintenanceService;

  const svc = new ShipTickService(mockTickService, mockShipState, mockMaintService);

  function fireTick(): void {
    if (!capturedHandler) throw new Error('handler not registered');
    capturedHandler({ kind: TickKind.SHIP_UPDATE, tickNumber: 1, firedAt: new Date() });
  }

  return { svc, mockShipState, mutatedState, fireTick };
}

describe('ShipTickService — auto-shield (US4, FR-006)', () => {
  it('raises shields when autoShield=true, recentlyWarpedExit=true, shields down', () => {
    const ship = makeShip({
      autoShield: true,
      shieldstat: 0,
      cantexit: 0,
      recentlyWarpedExit: true,
    });
    const { svc, mutatedState, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mutatedState.shieldstat).toBe(1);
    expect(mutatedState.recentlyWarpedExit).toBe(false);
    expect(mutatedState.recentlySelfFiredTorp).toBe(false);
  });

  it('raises shields when autoShield=true, recentlySelfFiredTorp=true, shields down', () => {
    const ship = makeShip({
      autoShield: true,
      shieldstat: 0,
      cantexit: 0,
      recentlySelfFiredTorp: true,
    });
    const { svc, mutatedState, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mutatedState.shieldstat).toBe(1);
  });

  it('does NOT raise shields when autoShield=false', () => {
    const ship = makeShip({
      autoShield: false,
      shieldstat: 0,
      cantexit: 0,
      recentlyWarpedExit: true,
    });
    const { svc, mockShipState, fireTick } = makeHarness(ship);
    svc.onModuleInit();

    const callsBefore = (mockShipState.mutate as jest.Mock).mock.calls.length;
    fireTick();
    const callsAfter = (mockShipState.mutate as jest.Mock).mock.calls.length;
    // No auto-shield mutate (only overspeed mutate possibly, which would be 0 for this ship)
    expect(callsAfter - callsBefore).toBe(0);
  });

  it('does NOT raise shields when autoShield=true but shieldstat already 1', () => {
    const ship = makeShip({
      autoShield: true,
      shieldstat: 1,  // already raised
      cantexit: 0,
      recentlyWarpedExit: true,
    });
    const { svc, mutatedState, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    // shieldstat should remain 1, not get double-applied
    expect(mutatedState.shieldstat).toBe(1);
  });

  it('does NOT raise shields when combat-locked', () => {
    const ship = makeShip({
      autoShield: true,
      shieldstat: 0,
      cantexit: 3,  // combat locked
      recentlyWarpedExit: true,
    });
    const { svc, mutatedState, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mutatedState.shieldstat).toBe(0);
  });

  it('does NOT raise shields when no trigger flags are set', () => {
    const ship = makeShip({
      autoShield: true,
      shieldstat: 0,
      cantexit: 0,
      recentlyWarpedExit: false,
      recentlySelfFiredTorp: false,
    });
    const { svc, mutatedState, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mutatedState.shieldstat).toBe(0);
  });
});
