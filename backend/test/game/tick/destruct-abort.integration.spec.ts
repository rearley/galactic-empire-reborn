/**
 * T038 — Abort integration spec.
 * destruct=5 then cmd_abort → tick is no-op, ship survives (SC-005).
 * @see GECMDS.C:5044 cmd_abort
 * @see specs/013-ship-management/tasks.md T038
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { AbortHandlerService } from '../../../src/game/commands/handlers/abort.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../src/game/commands/cloak.config';
import { COMBAT_SHIP_DESTROYED } from '../../../src/game/combat/combat-events';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'USS Survivor',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    items: Array(14).fill(0n) as bigint[],
    destruct: 5,
    ...overrides,
  });
}

describe('destruct abort integration — abort clears countdown, tick is no-op (SC-005)', () => {
  it('after abort, destructTick does not destroy the ship', () => {
    const state = makeShip({ destruct: 5 });

    const mockShipState = {
      findAllShips: jest.fn().mockReturnValue([state]),
      mutate: jest.fn().mockImplementation(
        (_uid: string, _no: number, fn: (s: ShipState) => void) => {
          fn(state);
          return state;
        },
      ),
      removeFromGame: jest.fn(),
    } as unknown as ShipStateService;

    const mockTickService = { subscribe: jest.fn() } as unknown as import('../../../src/game/tick/tick.service').TickService;
    const events = new EventEmitter2();

    const tickService = new ShipManagementTickService(mockShipState, mockTickService, events, CLOAK_ENERGY_USE_DEFAULT);
    const abortHandler = new AbortHandlerService(mockShipState);

    // Run 4 ticks (countdown: 5→4→3→2→1)
    tickService.destructTick(state);
    tickService.destructTick(state);
    tickService.destructTick(state);
    tickService.destructTick(state);
    expect(state.destruct).toBe(1);

    // Abort before the final tick
    abortHandler.command.handler(state, [], {});
    expect(state.destruct).toBe(0);

    // Next tick should be a no-op
    const destroyed: unknown[] = [];
    events.on(COMBAT_SHIP_DESTROYED, (e: unknown) => destroyed.push(e));
    tickService.destructTick(state);

    expect(destroyed).toHaveLength(0);
    expect(mockShipState.removeFromGame).not.toHaveBeenCalled();
    expect(state.destruct).toBe(0);
  });

  it('abort at destruct=5 allows ship to continue existing through multiple subsequent ticks', () => {
    const state = makeShip({ destruct: 5 });

    const mockShipState = {
      findAllShips: jest.fn().mockReturnValue([state]),
      mutate: jest.fn().mockImplementation(
        (_uid: string, _no: number, fn: (s: ShipState) => void) => {
          fn(state);
          return state;
        },
      ),
      removeFromGame: jest.fn(),
    } as unknown as ShipStateService;

    const mockTickService = { subscribe: jest.fn() } as unknown as import('../../../src/game/tick/tick.service').TickService;
    const events = new EventEmitter2();

    const tickService = new ShipManagementTickService(mockShipState, mockTickService, events, CLOAK_ENERGY_USE_DEFAULT);
    const abortHandler = new AbortHandlerService(mockShipState);

    abortHandler.command.handler(state, [], {});
    expect(state.destruct).toBe(0);

    // 20 subsequent ticks — ship must survive all of them
    for (let i = 0; i < 20; i++) {
      tickService.destructTick(state);
    }

    expect(mockShipState.removeFromGame).not.toHaveBeenCalled();
  });
});
