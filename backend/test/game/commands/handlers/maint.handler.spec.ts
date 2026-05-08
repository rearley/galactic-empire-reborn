/**
 * T016/T019 — Regression spec for MaintHandlerService after MaintenanceService extraction.
 * Verifies that the manual `maint` command delegates to MaintenanceService and returns
 * the correct CommandResult message strings in all gate cases.
 * @see GECMDS.C:4452 cmd_maint
 * @see backend/src/game/ship/maintenance.service.ts MaintenanceService
 */
import { MaintHandlerService } from '../../../../src/game/commands/handlers/maint.handler';
import { MaintenanceService, GateResult } from '../../../../src/game/ship/maintenance.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../../../../src/game/commands/_ship-management-constants';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(gateResult: GateResult = { ok: true, price: BigInt(MAINT_COST_NORMAL), repairAmt: 11 }) {
  const mockMaintenanceService = {
    runMaintenance: jest.fn().mockResolvedValue(gateResult),
  } as unknown as MaintenanceService;

  const handler = new MaintHandlerService(mockMaintenanceService);
  return { handler, mockMaintenanceService };
}

// ---------------------------------------------------------------------------
// Happy path — delegation to MaintenanceService
// ---------------------------------------------------------------------------

describe('MaintHandlerService — happy path (delegates to MaintenanceService)', () => {
  it('returns MAINT_OK with repair count when MaintenanceService returns ok=true', async () => {
    const repairAmt = 11;
    const { handler } = makeService({ ok: true, price: BigInt(MAINT_COST_NORMAL), repairAmt });
    const ship = makeShip({ damage: 30, where: 10, xcoord: 5.5, ycoord: 5.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string; category: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_OK, repairAmt));
    expect(result.lines[0].category).toBe('success');
  });

  it('calls MaintenanceService.runMaintenance with the ship', async () => {
    const { handler, mockMaintenanceService } = makeService();
    const ship = makeShip({ damage: 30, where: 10, xcoord: 5.5, ycoord: 5.5 });
    await handler.command.handler(ship, [], {});
    expect(mockMaintenanceService.runMaintenance).toHaveBeenCalledWith(ship, undefined);
  });

  it('returns MAINT_OK with Zygor price when MaintenanceService confirms Zygor price', async () => {
    const { handler } = makeService({ ok: true, price: BigInt(MAINT_COST_NEUTRAL), repairAmt: 11 });
    const ship = makeShip({ damage: 30, where: 10, xcoord: 0.5, ycoord: 0.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toContain('Maintenance complete');
  });
});

// ---------------------------------------------------------------------------
// Rejection paths — message routing from MaintenanceService gate reasons
// ---------------------------------------------------------------------------

describe('MaintHandlerService — rejection paths (T016 regression)', () => {
  it('not-in-orbit → MAINT_NOT_ORBIT', async () => {
    const { handler } = makeService({ ok: false, reason: 'not-in-orbit' });
    const ship = makeShip({ where: 0 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NOT_ORBIT));
  });

  it('no-facility → MAINT_NO_FACILITY', async () => {
    const { handler } = makeService({ ok: false, reason: 'no-facility' });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_FACILITY));
  });

  it('combat-locked → MAINT_COMBAT', async () => {
    const { handler } = makeService({ ok: false, reason: 'combat-locked' });
    const ship = makeShip({ where: 10, cantexit: 3 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_COMBAT));
  });

  it('nz-not-zygor → MAINT_NZ', async () => {
    const { handler } = makeService({ ok: false, reason: 'nz-not-zygor' });
    const ship = makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NZ));
  });

  it('no-damage → MAINT_NO_DAMAGE', async () => {
    const { handler } = makeService({ ok: false, reason: 'no-damage' });
    const ship = makeShip({ where: 10, damage: 0 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_DAMAGE));
  });

  it('insufficient-cash → MAINT_NO_CASH', async () => {
    const { handler } = makeService({ ok: false, reason: 'insufficient-cash' });
    const ship = makeShip({ where: 10, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_CASH));
  });
});

describe('MaintHandlerService — command metadata', () => {
  it('keyword is "maint", no aliases (mai moved to MaiHandlerService, T013), minArgs is 0', () => {
    const { handler } = makeService();
    expect(handler.command.keyword).toBe('maint');
    expect(handler.command.aliases).not.toContain('mai');
    expect(handler.command.minArgs).toBe(0);
  });
});
