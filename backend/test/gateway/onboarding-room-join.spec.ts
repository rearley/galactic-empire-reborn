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

/**
 * A brand-new pilot never joined any Socket.io room.
 *
 * The onboarding finalize path duplicates the welcome sequence inline instead
 * of going through `boardShipAndWelcome`, and the copy omits both
 * `client.join()` calls. Every sector-scoped broadcast therefore missed a
 * first-session pilot — radio traffic, another ship entering or leaving the
 * sector, someone's self-destruct countdown — and so did the per-captain
 * `user:` room, which carries the call-for-help alert when your planet is
 * attacked and the cloak-collapse warning. It came right only after a reload,
 * because the reconnect path does join.
 *
 * Found from a browser: two freshly-registered pilots on the same radio
 * frequency in the same sector could not hear each other, and the sector room
 * turned out to be empty.
 */
describe('GameGateway — a new pilot joins their rooms', () => {
  const USERID = 'u-new';

  const makeSocket = () => ({
    id: 'sock-new',
    connected: true,
    handshake: { query: { userid: USERID } },
    data: {
      userid: USERID,
      onboarding: { step: 'AWAITING_NAME' as const },
    } as Record<string, unknown>,
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    broadcast: { emit: jest.fn() },
  });

  const build = () => {
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: jest.fn(),
    } as unknown as ShipStateService;

    const onboardingService = {
      validateNameReply: () => true,
      finalize: jest.fn().mockResolvedValue({
        shipno: 1,
        shipname: 'Newcomer',
        shpclass: 1,
        xcoord: 12.25,
        ycoord: 7.75,
      }),
    } as unknown as OnboardingService;

    const gateway = new GameGateway(
      shipStateService,
      { dispatch: jest.fn() } as unknown as CommandRouterService,
      new ConnectedShipsRegistry(shipStateService),
      { validate: jest.fn() } as unknown as WsAuthGuard,
      { ship: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService,
      onboardingService,
      { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: () => ({ emit: jest.fn() }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return gateway;
  };

  it('joins the sector room for the ship it just created', async () => {
    const gateway = build();
    const sock = makeSocket();

    await gateway.handlePromptReply(sock as never, { value: 'Newcomer' });

    // Spawn at (12.25, 7.75) → sector 12,7.
    expect(sock.join).toHaveBeenCalledWith('sector:12:7');
  });

  it('joins the per-captain room that carries planet and cloak alerts', async () => {
    const gateway = build();
    const sock = makeSocket();

    await gateway.handlePromptReply(sock as never, { value: 'Newcomer' });

    expect(sock.join).toHaveBeenCalledWith(`user:${USERID}`);
  });

  it('still welcomes the pilot aboard', async () => {
    const gateway = build();
    const sock = makeSocket();

    await gateway.handlePromptReply(sock as never, { value: 'Newcomer' });

    const welcomes = sock.emit.mock.calls.filter(
      (c) => c[0] === 'command:result' &&
        JSON.stringify(c[1]).includes('Welcome aboard, Newcomer'),
    );
    expect(welcomes).toHaveLength(1);
    expect(sock.data.activeShipNo).toBe(1);
  });
});
