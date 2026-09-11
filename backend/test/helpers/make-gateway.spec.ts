import { makeGateway } from './make-gateway';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';

describe('makeGateway', () => {
  it('builds a GameGateway with every dependency defaulted', () => {
    const gateway = makeGateway();
    expect(gateway).toBeInstanceOf(GameGateway);
  });

  it('lets one dependency be overridden by name, leaving the rest defaulted', () => {
    const shipStateService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ShipStateService;
    const gateway = makeGateway({ shipStateService });
    expect((gateway as unknown as { shipStateService: ShipStateService }).shipStateService)
      .toBe(shipStateService);
  });

  it('gives each call its own dependency instances, so tests cannot leak state', () => {
    const a = makeGateway();
    const b = makeGateway();
    expect((a as unknown as { registry: unknown }).registry)
      .not.toBe((b as unknown as { registry: unknown }).registry);
  });
});
