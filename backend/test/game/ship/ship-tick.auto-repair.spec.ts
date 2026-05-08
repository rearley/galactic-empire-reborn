/**
 * T015 — ShipTickService auto-repair integration tests (US3).
 * Verifies that MaintenanceService.runAutoRepair is called when ship.autoRepair=true
 * and NOT called when autoRepair is false or absent.
 * @see backend/src/game/ship/ship-tick.service.ts ShipTickService
 * @see specs/019-physics-polish/spec.md US3, FR-005
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
    xcoord: 5.5, ycoord: 5.5, damage: 30, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makeHarness(ship: ShipState) {
  let capturedHandler: ((ctx: TickContext) => void) | null = null;

  const mockTickService = {
    subscribe: jest.fn().mockImplementation((_kind: TickKind, h: (ctx: TickContext) => void) => {
      capturedHandler = h;
      return jest.fn();
    }),
  } as unknown as TickService;

  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue([ship]),
    mutate: jest.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      fn({ ...ship } as ShipState);
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

  return { svc, mockMaintService, fireTick };
}

describe('ShipTickService — auto-repair (US3, FR-005)', () => {
  it('calls runAutoRepair when ship.autoRepair === true', () => {
    const ship = makeShip({ autoRepair: true, damage: 30 });
    const { svc, mockMaintService, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mockMaintService.runAutoRepair).toHaveBeenCalledWith(ship);
  });

  it('does NOT call runAutoRepair when ship.autoRepair === false', () => {
    const ship = makeShip({ autoRepair: false, damage: 30 });
    const { svc, mockMaintService, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mockMaintService.runAutoRepair).not.toHaveBeenCalled();
  });

  it('does NOT call runAutoRepair when ship.autoRepair is undefined', () => {
    const ship = makeShip({ damage: 30 });
    // autoRepair field not set
    const { svc, mockMaintService, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(mockMaintService.runAutoRepair).not.toHaveBeenCalled();
  });
});
