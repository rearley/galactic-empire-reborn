import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

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
      // handleConnection always sets this from the JWT; the finalize path needs
      // it because a freshly-created ShipState has no username yet.
      username: 'rick',
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

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      prisma: { ship: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService,
      onboardingService,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
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
        JSON.stringify(c[1]).includes('Welcome aboard Commander rick'),
    );
    expect(welcomes).toHaveLength(1);
    expect(sock.data.activeShipNo).toBe(1);
  });

  /**
   * The entire first-run output was "Welcome aboard, <ship>." — nothing told a
   * brand-new pilot that `hel` exists, let alone what to do with a starter
   * Interceptor sitting in the neutral zone. Everything else in the game is
   * discoverable from the help topics; finding the help was the hard part.
   */
  it('points a first-time pilot at the help', async () => {
    const gateway = build();
    const sock = makeSocket();

    await gateway.handlePromptReply(sock as never, { value: 'Newcomer' });

    const shown = sock.emit.mock.calls
      .filter((c) => c[0] === 'command:result')
      .map((c) => JSON.stringify(c[1]))
      .join('\n');
    expect(shown).toMatch(/hel/);
  });
});
