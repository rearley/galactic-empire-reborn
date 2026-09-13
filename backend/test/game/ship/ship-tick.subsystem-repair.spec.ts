/**
 * Subsystem repair — ship-tick.service.ts processShip step.
 * @see GECMDS.C C-010 / S-007 (Plan 4, Task 3)
 */
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { SHIELDDM } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';


function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    status: 0,
    ...overrides,
  });
}

function makeCtx(tickNumber = 1): TickContext {
  return { kind: TickKind.SHIP_UPDATE, tickNumber, firedAt: new Date() };
}

/**
 * Harness that actually applies mutations to the ship object so we can
 * observe field values after processShip.
 */
function makeHarness(ship: ShipState) {
  let capturedHandler: ((ctx: TickContext) => void) | null = null;
  const unsub = vi.fn();

  const mockTickService = {
    subscribe: vi.fn().mockImplementation((_kind: TickKind, handler: (ctx: TickContext) => void) => {
      capturedHandler = handler;
      return unsub;
    }),
  } as unknown as TickService;

  const mockShipState = {
    findAllShips: vi.fn().mockReturnValue([ship]),
    mutate: vi.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      fn(ship);
    }),
  } as unknown as ShipStateService;

  const mockMaintService = {
    runAutoRepair: vi.fn().mockResolvedValue(undefined),
  } as unknown as MaintenanceService;

  const svc = new ShipTickService(mockTickService, mockShipState, mockMaintService);
  svc.onModuleInit();

  function fireTick(ctx = makeCtx()): void {
    if (!capturedHandler) throw new Error('handler not registered');
    capturedHandler(ctx);
  }

  return { svc, fireTick };
}

describe('subsystem repair — tactical', () => {
  it('tactical=-5: one tick moves it toward 0 by 1', () => {
    const ship = makeShip({ tactical: -5 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(-4);
  });

  it('tactical=-1: one tick brings it to 0 (operational)', () => {
    const ship = makeShip({ tactical: -1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(0);
  });

  it('tactical=0: no change (already operational)', () => {
    const ship = makeShip({ tactical: 0 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(0);
  });
});

describe('subsystem repair — helm', () => {
  it('helm=-3: one tick moves it toward 0 by 1', () => {
    const ship = makeShip({ helm: -3 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.helm).toBe(-2);
  });

  it('helm=-1: one tick brings it to 0', () => {
    const ship = makeShip({ helm: -1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.helm).toBe(0);
  });
});

describe('subsystem repair — cloak is NOT this service\'s job', () => {
  /**
   * C has exactly one increment site for a damaged cloak — `cloakstat`
   * (GEFUNCS.C:1388-1398), called once per 6-second warrtia (GEMAIN.C:2259).
   * The port had it here AND in ShipManagementTickService, healing a shot-out
   * cloak at 7 points per 6 seconds instead of 1. ShipManagementTickService
   * owns it; this service leaves it alone.
   */
  it('leaves a damaged cloak to ShipManagementTickService', () => {
    const ship = makeShip({ cloak: -4 });
    const { svc, fireTick } = makeHarness(ship);
    svc.onModuleInit();
    fireTick();
    expect(ship.cloak).toBe(-4);
  });
});

describe('subsystem repair — firecntl', () => {
  it('firecntl=7: one tick decrements by 1', () => {
    const ship = makeShip({ firecntl: 7 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.firecntl).toBe(6);
  });

  it('firecntl=1: one tick brings it to 0 (fire control restored)', () => {
    const ship = makeShip({ firecntl: 1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.firecntl).toBe(0);
  });

  it('firecntl=0: no change', () => {
    const ship = makeShip({ firecntl: 0 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.firecntl).toBe(0);
  });
});

describe('subsystem repair — shield (Fix 4: rate = +shieldtype per tick)', () => {
  it('shield=-10, shieldstat=SHIELDDM, shieldtype=1: one tick moves shield toward 0 by 1', () => {
    const ship = makeShip({ shield: -10, shieldstat: SHIELDDM, shieldtype: 1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.shield).toBe(-9);
    expect(ship.shieldstat).toBe(SHIELDDM); // still damaged
  });

  it('shield=-1, shieldstat=SHIELDDM, shieldtype=1: one tick brings shield to 0 and resets shieldstat to 0', () => {
    const ship = makeShip({ shield: -1, shieldstat: SHIELDDM, shieldtype: 1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.shield).toBe(0);
    expect(ship.shieldstat).toBe(0); // back to down state
  });

  it('shield=-6, shieldstat=SHIELDDM, shieldtype=3: one tick moves shield by +3', () => {
    const ship = makeShip({ shield: -6, shieldstat: SHIELDDM, shieldtype: 3 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.shield).toBe(-3);
    expect(ship.shieldstat).toBe(SHIELDDM);
  });
});

describe('subsystem repair — cantexit independence', () => {
  it('subsystems recover even when cantexit > 0 (unlike hull repair)', () => {
    const ship = makeShip({ tactical: -3, helm: -2, cantexit: 5 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(-2);
    expect(ship.helm).toBe(-1);
  });
});

describe('subsystem repair — positive cloak guard', () => {
  it('active (positive) cloak is NOT touched by subsystem repair', () => {
    const ship = makeShip({ cloak: 10, tactical: 0, helm: 0, firecntl: 0, shieldstat: 0 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.cloak).toBe(10); // repair must only lift NEGATIVE cloak
  });
});

describe('subsystem repair — healthy ship no-op', () => {
  it('fully healthy ship: no subsystem fields change after a tick', () => {
    const ship = makeShip({ tactical: 0, helm: 0, cloak: 0, firecntl: 0, shieldstat: 0 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(0);
    expect(ship.helm).toBe(0);
    expect(ship.cloak).toBe(0);
    expect(ship.firecntl).toBe(0);
    expect(ship.shieldstat).toBe(0);
  });
});

describe('subsystem repair — phasr (Fix 2: negative phasr recovers +1/tick via ship-update)', () => {
  it('phasr=-8: one tick moves toward 0 by +1', () => {
    const ship = makeShip({ phasr: -8 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.phasr).toBe(-7);
  });

  it('phasr=-1: one tick brings it to 0', () => {
    const ship = makeShip({ phasr: -1 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.phasr).toBe(0);
  });

  it('phasr=0: no change (not negative)', () => {
    const ship = makeShip({ phasr: 0 });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.phasr).toBe(0);
  });
});

describe('subsystem repair — all at once', () => {
  it('all damaged subsystems repair one step per tick', () => {
    const ship = makeShip({
      tactical: -5, helm: -3, cloak: -4, firecntl: 7,
      shield: -10, shieldstat: SHIELDDM, shieldtype: 1,
      phasr: -4,
    });
    const { fireTick } = makeHarness(ship);
    fireTick();
    expect(ship.tactical).toBe(-4);
    expect(ship.helm).toBe(-2);
    expect(ship.cloak).toBe(-4); // owned by ShipManagementTickService
    expect(ship.firecntl).toBe(6);
    expect(ship.shield).toBe(-9);
    expect(ship.shieldstat).toBe(SHIELDDM);
    expect(ship.phasr).toBe(-3);
  });
});
