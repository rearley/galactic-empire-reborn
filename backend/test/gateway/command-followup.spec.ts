import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { PresenceService } from '../../src/public/presence.service';

/**
 * A handler that asks the player an open question (today: `land` on an unowned
 * planet, "What would you like to name this planet?") must have its answer fed
 * back to that handler — not re-parsed as a command.
 *
 * Found by playtest: answering the land prompt with "New Terra" matched the
 * `new` verb under 3-char prefix routing and printed the `new ship` usage line,
 * leaving the planet unclaimed with no way to name it except knowing to type
 * `land <name>` directly.
 *
 * @see specs/005-planet-system/contracts/commands.md §land — "the gateway
 *      re-dispatches with the supplied input as the next `land <name>`"
 */
describe('GameGateway — expectFollowup redispatch', () => {
  let gateway: GameGateway;
  let dispatch: jest.Mock;

  const makeSocket = () => ({
    id: 'sock-1',
    connected: true,
    handshake: { query: { userid: 'user1' } },
    data: { userid: 'user1', activeShipNo: 1 } as Record<string, unknown>,
    emit: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    broadcast: { emit: jest.fn() },
  });

  beforeEach(() => {
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue({ userid: 'user1', shipno: 1, shipname: 'Merchant1' }),
    } as unknown as ShipStateService;

    dispatch = jest.fn().mockReturnValue({ lines: [] });

    gateway = new GameGateway(
      shipStateService,
      { dispatch } as unknown as CommandRouterService,
      new ConnectedShipsRegistry(shipStateService),
      { validate: jest.fn() } as unknown as WsAuthGuard,
      {} as unknown as PrismaService,
      {} as unknown as OnboardingService,
      { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
    );
    (gateway as unknown as { server: unknown }).server = {
      // handleCombatShipDestroyed also sends YOURDEAD to the victim's own room
      // (GEFUNCS.C:978-987), so the double needs a to().
      to: jest.fn(() => ({ emit: jest.fn() })),
      emit: jest.fn(),
      sockets: { sockets: { get: jest.fn() } },
    };
  });

  it('feeds the next input back to the handler that asked', () => {
    const socket = makeSocket();

    dispatch.mockReturnValueOnce({ lines: [{ text: 'Name?', category: 'system' }], expectFollowup: 'land' });
    gateway.handleCommand(socket as never, { input: 'lan' });

    gateway.handleCommand(socket as never, { input: 'New Terra' });
    expect(dispatch).toHaveBeenLastCalledWith('land New Terra', expect.anything(), expect.anything());
  });

  it('is one-shot — the input after the answer routes normally again', () => {
    const socket = makeSocket();

    dispatch.mockReturnValueOnce({ lines: [], expectFollowup: 'land' });
    gateway.handleCommand(socket as never, { input: 'lan' });
    gateway.handleCommand(socket as never, { input: 'New Terra' });
    gateway.handleCommand(socket as never, { input: 'new ship 4' });

    expect(dispatch).toHaveBeenLastCalledWith('new ship 4', expect.anything(), expect.anything());
  });

  it('an empty answer cancels the prompt instead of redispatching', () => {
    const socket = makeSocket();

    dispatch.mockReturnValueOnce({ lines: [], expectFollowup: 'land' });
    gateway.handleCommand(socket as never, { input: 'lan' });
    dispatch.mockClear();

    gateway.handleCommand(socket as never, { input: '   ' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'command:result',
      expect.objectContaining({ lines: [{ text: 'Never mind.', category: 'system' }] }),
    );
  });
});
