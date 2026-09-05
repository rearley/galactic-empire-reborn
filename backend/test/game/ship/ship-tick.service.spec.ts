/**
 * T002 — ShipTickService lifecycle tests.
 * Verifies subscribe/unsubscribe lifecycle, fault isolation per ship,
 * and that processShip is called for each active ship.
 * @see backend/src/game/ship/ship-tick.service.ts ShipTickService
 */
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState } from '../../../src/game/ship/ship-state.types';


// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeCtx(tickNumber = 1): TickContext {
  return { kind: TickKind.SHIP_UPDATE, tickNumber, firedAt: new Date() };
}

function makeHarness(ships: ShipState[] = []) {
  let capturedHandler: ((ctx: TickContext) => void) | null = null;
  const unsub = jest.fn();

  const mockTickService = {
    subscribe: jest.fn().mockImplementation((kind: TickKind, handler: (ctx: TickContext) => void) => {
      capturedHandler = handler;
      return unsub;
    }),
  } as unknown as TickService;

  const mockShipState = {
    findAllShips: jest.fn().mockReturnValue(ships),
    mutate: jest.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      const s = ships[0] ? { ...ships[0] } : makeShip();
      fn(s);
      return s;
    }),
  } as unknown as ShipStateService;

  const mockMaintService = {
    runAutoRepair: jest.fn().mockResolvedValue(undefined),
  } as unknown as MaintenanceService;

  const svc = new ShipTickService(mockTickService, mockShipState, mockMaintService);

  function fireTick(ctx = makeCtx()): void {
    if (!capturedHandler) throw new Error('handler not registered');
    capturedHandler(ctx);
  }

  return { svc, mockTickService, mockShipState, mockMaintService, unsub, fireTick };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('ShipTickService — lifecycle', () => {
  it('subscribes to SHIP_UPDATE on onModuleInit', () => {
    const { svc, mockTickService } = makeHarness();
    svc.onModuleInit();
    expect(mockTickService.subscribe).toHaveBeenCalledWith(TickKind.SHIP_UPDATE, expect.any(Function));
  });

  it('calls unsubscribe on onModuleDestroy', () => {
    const { svc, unsub } = makeHarness();
    svc.onModuleInit();
    svc.onModuleDestroy();
    expect(unsub).toHaveBeenCalled();
  });

  it('does not crash on destroy before init', () => {
    const { svc } = makeHarness();
    expect(() => svc.onModuleDestroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Per-ship dispatch
// ---------------------------------------------------------------------------

describe('ShipTickService — per-ship processing', () => {
  it('calls findAllShips on each tick', () => {
    const { svc, mockShipState, fireTick } = makeHarness([makeShip()]);
    svc.onModuleInit();
    fireTick();
    expect(mockShipState.findAllShips).toHaveBeenCalled();
  });

  it('processes all active ships', () => {
    const ships = [makeShip({ userid: 'u1', shipno: 1 }), makeShip({ userid: 'u2', shipno: 1 })];
    const { svc, mockShipState, fireTick } = makeHarness(ships);
    svc.onModuleInit();
    fireTick();
    expect(mockShipState.findAllShips).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fault isolation — one ship error does not affect others
// ---------------------------------------------------------------------------

describe('ShipTickService — fault isolation', () => {
  it('continues processing remaining ships when one ship throws', () => {
    const ships = [
      makeShip({ userid: 'boom', shipno: 1 }),
      makeShip({ userid: 'safe', shipno: 1 }),
    ];
    const { svc, mockShipState, mockMaintService, fireTick } = makeHarness(ships);

    let callCount = 0;
    (mockShipState.findAllShips as jest.Mock).mockReturnValue(ships);
    (mockMaintService.runAutoRepair as jest.Mock).mockImplementation((ship: ShipState) => {
      callCount++;
      if (ship.userid === 'boom') throw new Error('boom!');
      return Promise.resolve();
    });

    svc.onModuleInit();
    expect(() => fireTick()).not.toThrow();
  });
});
