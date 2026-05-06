import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';

/**
 * Verifies player.joined broadcasts after snapshot and player.left fires on disconnect.
 *
 * @see specs/010-react-frontend/contracts/websocket-events.md §2 player.joined §3 player.left
 * @see FR-024, FR-025
 */
describe('GameGateway player.joined / player.left', () => {
  let gateway: GameGateway;
  let registry: ConnectedShipsRegistry;
  let serverEmitMock: jest.Mock;

  const shipState = {
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
  };

  const makeSocket = (id: string, userid = 'user1') => ({
    id,
    connected: true,
    handshake: { query: { userid } },
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  });

  const mockShipStateService = (): Partial<ShipStateService> => ({
    findByUserid: jest.fn().mockReturnValue([shipState]),
    get: jest.fn().mockReturnValue(shipState),
  });

  beforeEach(() => {
    serverEmitMock = jest.fn();
    const svc = mockShipStateService();
    registry = new ConnectedShipsRegistry(svc as ShipStateService);
    gateway = new GameGateway(svc as ShipStateService, {} as CommandRouterService, registry);
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmitMock,
      sockets: { sockets: { get: jest.fn().mockReturnValue(undefined) } },
    };
  });

  it('broadcasts player.joined via server.emit after handleConnection (FR-024)', () => {
    const socket = makeSocket('sock-1');
    gateway.handleConnection(socket as never);
    expect(serverEmitMock).toHaveBeenCalledWith(
      'player.joined',
      expect.objectContaining({
        shipId: 'user1:1',
        name: 'Defiant',
        shipClass: 3,
      }),
    );
  });

  it('player.joined payload contains sector derived from floor(xcoord), floor(ycoord)', () => {
    const socket = makeSocket('sock-1');
    gateway.handleConnection(socket as never);
    const joinedCall = (serverEmitMock.mock.calls as [string, unknown][]).find(
      ([ev]) => ev === 'player.joined',
    );
    expect(joinedCall).toBeDefined();
    const payload = joinedCall![1] as { sector: { x: number; y: number } };
    expect(payload.sector).toEqual({ x: 5, y: 3 }); // floor(5.7)=5, floor(3.2)=3
  });

  it('broadcasts player.left via server.emit on handleDisconnect (FR-025)', () => {
    const socket = makeSocket('sock-1');
    gateway.handleConnection(socket as never);
    serverEmitMock.mockClear();

    gateway.handleDisconnect(socket as never);
    expect(serverEmitMock).toHaveBeenCalledWith('player.left', { shipId: 'user1:1' });
  });

  it('does NOT emit player.left if socket was never registered (no spurious events)', () => {
    const socket = makeSocket('unknown-sock');
    // Connect and disconnect a socket that never resolved (no valid userid)
    // Directly call handleDisconnect without a prior handleConnection
    gateway.handleDisconnect(socket as never);
    expect(serverEmitMock).not.toHaveBeenCalledWith('player.left', expect.anything());
  });
});
