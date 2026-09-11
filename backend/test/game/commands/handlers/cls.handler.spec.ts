/**
 * T026 — Unit spec for ClsHandlerService.
 * Clears the frontend event log; pure handler with no backend mutation.
 * @see GECMDS.C:117 cmd_cls
 * @see specs/016-navigation-spy/tasks.md T026
 */
import { ClsHandlerService } from '../../../../src/game/commands/handlers/cls.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.0,
    ycoord: 5.0,
    energy: 50000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
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
