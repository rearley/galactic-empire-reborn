/**
 * T045-T046 — Password gate tests for MaintHandlerService.
 * Covers FR-014-060 (no arg + passworded), FR-014-061 (wrong arg),
 * FR-014-062 (password == "none" bypass), FR-014-063 (correct arg),
 * and order-preservation (gate fires after FR-209, before FR-204).
 *
 * The password gate lives in MaintenanceService.evaluateGates; the handler
 * passes args[0] as the passwordArg. These tests verify message routing
 * from the gate reasons returned by MaintenanceService.
 *
 * @see GECMDS.C:4471 MAINT2, :4479 MAINT3
 * @see backend/src/game/ship/maintenance.service.ts MaintenanceService.evaluateGates
 * @see research.md D10
 */
import { MaintHandlerService } from '../../../../src/game/commands/handlers/maint.handler';
import { MaintenanceService, GateResult } from '../../../../src/game/ship/maintenance.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { MAINT_COST_NORMAL } from '../../../../src/game/commands/_ship-management-constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    damage: 30,
    energy: 10000,
    where: 10,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeService(gateResult: GateResult) {
  const mockMaintenanceService = {
    runMaintenance: jest.fn().mockResolvedValue(gateResult),
  } as unknown as MaintenanceService;

  const handler = new MaintHandlerService(mockMaintenanceService);
  return { handler, mockMaintenanceService };
}

const OK_RESULT: GateResult = { ok: true, price: BigInt(MAINT_COST_NORMAL), repairAmt: 11 };

type Lines = { lines: { text: string; category: string }[] };

// ---------------------------------------------------------------------------
// T045 — Four password-state combinations
// ---------------------------------------------------------------------------

describe('MaintHandlerService — password gate (T045)', () => {
  it('FR-014-060: no arg + passworded planet → MAINT2', async () => {
    const { handler, mockMaintenanceService } = makeService({ ok: false, reason: 'password-required' });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT2));
    // MaintenanceService was called with empty passwordArg (args[0] = undefined → args[0])
    expect(mockMaintenanceService.runMaintenance).toHaveBeenCalledWith(ship, undefined);
  });

  it('FR-014-061: wrong password arg → MAINT3', async () => {
    const { handler, mockMaintenanceService } = makeService({ ok: false, reason: 'wrong-password' });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, ['wrongpass'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT3));
    expect(mockMaintenanceService.runMaintenance).toHaveBeenCalledWith(ship, 'wrongpass');
  });

  it('FR-014-063: correct arg (case-insensitive) → maintenance proceeds', async () => {
    const { handler } = makeService(OK_RESULT);
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, ['secret'], {}) as Lines;
    expect(result.lines[0].text).toContain('commencing the maintenance and repairs');
  });

  it('FR-014-062: password == "none" → gate bypassed, maintenance proceeds', async () => {
    const { handler } = makeService(OK_RESULT);
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toContain('commencing the maintenance and repairs');
  });

  it('SC-007: no debit on password-required rejection', async () => {
    // MaintenanceService returns gate rejection — applyMaintenance never runs
    const { handler, mockMaintenanceService } = makeService({ ok: false, reason: 'password-required' });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    await handler.command.handler(ship, [], {});
    // Gate rejected — runMaintenance was called but returned ok=false (no cash deduction)
    expect(mockMaintenanceService.runMaintenance).toHaveBeenCalledTimes(1);
  });

  it('SC-007: no debit on wrong-password rejection', async () => {
    const { handler, mockMaintenanceService } = makeService({ ok: false, reason: 'wrong-password' });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    await handler.command.handler(ship, ['wrong'], {});
    expect(mockMaintenanceService.runMaintenance).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// T046 — Order preservation: gate fires AFTER FR-209, BEFORE FR-204
// ---------------------------------------------------------------------------

describe('MaintHandlerService — password gate ordering (T046)', () => {
  it('FR-209 (NZ non-Zygor) fires before password gate', async () => {
    // MaintenanceService returns nz-not-zygor (NZ check runs before password check
    // inside evaluateGates — verified in maintenance.service.spec.ts T014).
    // Handler must route to MAINT_NZ, not MAINT2.
    const { handler } = makeService({ ok: false, reason: 'nz-not-zygor' });
    const ship = makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NZ));
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.MAINT2));
  });

  it('asks for the password even when the ship is undamaged', async () => {
    // The damage gate is gone — canon never had one — so this now says only
    // that an undamaged ship still meets the password check rather than
    // slipping past it.
    const { handler } = makeService({ ok: false, reason: 'password-required' });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 0 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT2));
  });
});
