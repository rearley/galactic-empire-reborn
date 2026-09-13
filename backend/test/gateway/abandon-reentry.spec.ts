import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { SHIP_STATUS_ABANDONED } from '../../src/game/commands/_ship-management-constants';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * FR-704: after `abandon` the captain stays authenticated but shipless and must
 * be routed back through onboarding to acquire a new ship.
 *
 * Only the first half was implemented. The handler cleared `activeShipNo` and
 * stopped there, so the session answered "No active ship." to everything; and
 * because the connect path selected ships with no status filter, reconnecting
 * boarded the abandoned hull again and the router gate then rejected every
 * command with "Your ship has been abandoned." — the account could never play
 * again. `aba` is one keystroke from `abo` (abort self-destruct).
 *
 * @see specs/013-ship-management/spec.md FR-704
 */
describe('GameGateway — re-entry after abandon (FR-704)', () => {
  const USERID = 'u1';

  const makeRow = (shipno: number, status: number) => ({
    userid: USERID,
    shipno,
    shipname: `Ship${shipno}`,
    shpclass: 1,
    xcoord: 5.5,
    ycoord: 3.5,
    status,
    items: Array(16).fill(0n),
  });

  const makeSocket = () => ({
    id: 'sock-1',
    connected: true,
    handshake: { query: { userid: USERID } },
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    broadcast: { emit: vi.fn(), to: () => ({ emit: vi.fn() }), except: () => ({ emit: vi.fn() }) },
  });

  const build = (rows: ReturnType<typeof makeRow>[]) => {
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: vi.fn().mockReturnValue({ userid: USERID, shipno: 1, shipname: 'Ship1', shpclass: 1, xcoord: 5.5, ycoord: 3.5 }),
      hydrate: vi.fn(),
      board: vi.fn(),
    } as unknown as ShipStateService;

    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ userid: USERID }) },
      ship: {
        findMany: vi.fn().mockResolvedValue(rows),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: {
        validate: vi.fn().mockImplementation((sock: { data: Record<string, unknown> }) => {
          sock.data.userid = USERID;
          return Promise.resolve({ sub: USERID, username: USERID });
        }),
      } as unknown as WsAuthGuard,
      prisma,
      onboardingService: { buildClassListPayload: vi.fn().mockResolvedValue([]) } as unknown as OnboardingService,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: vi.fn().mockReturnValue('Interceptor') } as unknown as ShipClassCacheService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      // .except() is part of the real Socket.io chain — WARHUP uses it.
      to: () => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) }),
      // ANNOUN is a top-level server.except(...) broadcast.
      except: () => ({ emit: vi.fn(), to: () => ({ emit: vi.fn() }) }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, prisma };
  };

  const events = (sock: { emit: Mock }): string[] =>
    sock.emit.mock.calls.map((c) => c[0] as string);

  it('a captain whose only ship is abandoned lands in onboarding, not aboard the hull', async () => {
    const { gateway } = build([makeRow(1, SHIP_STATUS_ABANDONED)]);
    const sock = makeSocket();

    await gateway.handleConnection(sock as never);

    expect(events(sock)).toContain('prompt:ship-name');
    expect(sock.data.activeShipNo).toBeUndefined();
  });

  it('an abandoned hull alongside a live ship is skipped, and the live one boards', async () => {
    const { gateway } = build([makeRow(1, SHIP_STATUS_ABANDONED), makeRow(2, 1)]);
    const sock = makeSocket();

    await gateway.handleConnection(sock as never);

    // One usable ship → straight aboard, no selection menu, no onboarding.
    expect(events(sock)).not.toContain('prompt:ship-select');
    expect(events(sock)).not.toContain('prompt:ship-name');
    expect(sock.data.activeShipNo).toBe(2);
  });

  it('two live ships still get the selection menu', async () => {
    const { gateway } = build([makeRow(1, 1), makeRow(2, 1)]);
    const sock = makeSocket();

    await gateway.handleConnection(sock as never);

    expect(events(sock)).toContain('prompt:ship-select');
  });

  it('a command result asking for re-entry runs it after the reply is emitted', async () => {
    const { gateway } = build([makeRow(1, SHIP_STATUS_ABANDONED)]);
    const sock = makeSocket();
    sock.data.userid = USERID;
    sock.data.activeShipNo = 1;

    const router = (gateway as unknown as { commandRouter: { dispatch: Mock } }).commandRouter;
    router.dispatch.mockReturnValue({
      lines: [{ text: 'You have abandoned ship Ship1.', category: 'success' }],
      reenterShipEntry: true,
    });

    gateway.handleCommand(sock as never, { input: 'abandon' });
    await new Promise((r) => setImmediate(r));

    expect(events(sock)).toContain('command:result');
    expect(events(sock)).toContain('prompt:ship-name');
  });

  it('abandoning in-session prompts for a new ship right away', async () => {
    const { gateway } = build([makeRow(1, SHIP_STATUS_ABANDONED)]);
    const sock = makeSocket();
    sock.data.userid = USERID;
    sock.data.activeShipNo = 1;

    await (gateway as unknown as {
      presentShipEntry: (c: unknown, u: string) => Promise<void>;
    }).presentShipEntry(sock as never, USERID);

    expect(events(sock)).toContain('prompt:ship-name');
  });
});
