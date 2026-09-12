/**
 * T046 — abandon while destruct > 0 clears the countdown and takes precedence.
 * @see specs/013-ship-management/spec.md Edge Cases
 * @see AbandonHandlerService — destruct cleared before marking abandoned
 */
import { AbandonHandlerService } from '../../../../src/game/commands/handlers/abandon.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from '../../../../src/game/commands/_ship-management-constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'USS Bailing',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeService(ship: ShipState) {
  const mockShipState = {
    // abandon() persists status as well as setting it — the tick flush strips
    // `status`, so the handler cannot go through mutate().
    abandon: vi.fn().mockImplementation((_uid: string, _no: number) => {
      ship.status = SHIP_STATUS_ABANDONED;
      ship.destruct = 0;
      return Promise.resolve();
    }),
  } as unknown as ShipStateService;
  return { handler: new AbandonHandlerService(mockShipState, { abandonPlanet: vi.fn().mockResolvedValue({ ok: true, name: 'Aurora' }) } as unknown as PlanetStateService) };
}

describe('abandon destruct precedence edge case', () => {
  it('abandon while destruct=15 → destruct cleared to 0, status=ABANDONED', async () => {
    const ship = makeShip({ destruct: 15, status: 1 });
    const { handler } = makeService(ship);
    await handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });

  it('abandon while destruct=1 (final tick imminent) → destruct cleared before countdown expires', async () => {
    const ship = makeShip({ destruct: 1, status: 1 });
    const { handler } = makeService(ship);
    await handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });

  it('abandon with destruct=0 → status still set to ABANDONED (no-destruct path also works)', async () => {
    const ship = makeShip({ destruct: 0, status: 1 });
    const { handler } = makeService(ship);
    await handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.destruct).toBe(0);
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });
});
