/**
 * GameGateway — the connection, auth and entry decisions.
 *
 * Round 3. This file covers the branches that decide WHO GETS IN and what
 * happens to the sockets they leave behind: the handshake guard, the
 * per-account socket cap, the MAXPLRS seat gate, the deleted-account logout,
 * and the two refusals inside boarding. A wrong answer on any of them either
 * locks a paying-attention pilot out of their own account, admits someone the
 * seat gate should have turned away, or resurrects a hull the delete-model had
 * already removed from the world.
 *
 * Everything here enters through the REAL entry points — `handleConnection`,
 * `handleDisconnect`, `handlePromptReply`, `handleCommand` — never through a
 * private helper, because the caller and the helper are exactly where this
 * project's defects have lived. `socket-cap-per-account.spec.ts` already pins
 * `capSocketsForUser` in isolation; nothing until now proved the gateway
 * WRITES BACK the list it computes from, which is the half that decides
 * whether the second eviction hits the second-oldest tab or the first one
 * again.
 *
 * @see GEMAIN.C:2769 `if (numwar < gemaxplrs)` — the seat gate this mirrors
 * @see GEMAIN.C:459 numopt(MAXPLRS,1,256)
 * @see gateway/socket-cap.ts, docs/audits/2026-09-09-security-review.md
 */
import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { PresenceService } from '../../src/public/presence.service';
import { MAXPLRS, GESTAT_USER, GESTAT_AUTO } from '../../src/game/constants';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { mockRandom } from '../fixtures/mock-random';

// ───────────────────────────────────────────────────────────────────────────
// Doubles
// ───────────────────────────────────────────────────────────────────────────

interface Emitted {
  event: string;
  payload: unknown;
}

interface FakeSocket {
  id: string;
  connected: boolean;
  data: Record<string, unknown>;
  handshake: { query: Record<string, string> };
  emitted: Emitted[];
  disconnectCalls: unknown[];
  joinedRooms: string[];
  emit(event: string, payload?: unknown): void;
  on(event: string, cb: (reason: string) => void): void;
  disconnect(close?: boolean): void;
  join(room: string): void;
  leave(room: string): void;
  broadcast: {
    emit(event: string, payload?: unknown): void;
    to(room: string): { emit(event: string, payload?: unknown): void };
    except(room: string): { emit(event: string, payload?: unknown): void };
  };
}

const noopEmitter = { emit: (): void => undefined };

function makeSocket(id: string): FakeSocket {
  const emitted: Emitted[] = [];
  const disconnectCalls: unknown[] = [];
  const joinedRooms: string[] = [];
  return {
    id,
    connected: true,
    data: {},
    handshake: { query: {} },
    emitted,
    disconnectCalls,
    joinedRooms,
    emit(event: string, payload?: unknown): void {
      emitted.push({ event, payload });
    },
    on(): void {
      /* the gateway registers its disconnect-reason listener here */
    },
    disconnect(close?: boolean): void {
      this.connected = false;
      disconnectCalls.push(close);
    },
    join(room: string): void {
      joinedRooms.push(room);
    },
    leave(): void {
      /* unused */
    },
    broadcast: {
      emit: (): void => undefined,
      to: () => noopEmitter,
      except: () => noopEmitter,
    },
  };
}

const events = (sock: FakeSocket): string[] => sock.emitted.map((e) => e.event);
const payloadOf = (sock: FakeSocket, event: string): unknown =>
  sock.emitted.find((e) => e.event === event)?.payload;

/** A Prisma `Ship` row, only as complete as the boarding path actually reads. */
function makeShipRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    userid: 'usr_a',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
    damage: 0,
    energy: 5000,
    heading: 0,
    speed: 0,
    where: 0,
    cloak: 0,
    status: GESTAT_USER,
    items: new Array<bigint>(14).fill(0n),
    ...over,
  };
}

/** An in-flight ship as `findAllShips()` reports it to the seat gate. */
function seatedShip(userid: string, shipno: number, status: number): ShipState {
  return {
    userid,
    shipno,
    shipname: `hull-${shipno}`,
    shpclass: 3,
    xcoord: 1,
    ycoord: 1,
    status,
    msgFilter: false,
    channel: shipno,
  } as unknown as ShipState;
}

interface HarnessOpts {
  /** Rows `prisma.ship.findMany` returns for the connecting account. */
  ships?: Record<string, unknown>[];
  /** `prisma.user.findUnique` result — `null` means the account row is gone. */
  userRow?: Record<string, unknown> | null;
  /** What `findAllShips()` reports, i.e. who is holding a seat. */
  seated?: ShipState[];
  /** Simulates a `board()` that fails to land the ship in memory. */
  boardIsNoop?: boolean;
  /** Handshake validation result; `null` = the guard rejected the socket. */
  authPayload?: { sub: string; username: string } | null;
}

function build(opts: HarnessOpts = {}) {
  const {
    ships = [],
    userRow = { userid: 'usr_a', teamcode: null, options: [0, 0, 0, 0], kills: 0, username: 'Ripley', fkeys: [] },
    seated = [],
    boardIsNoop = false,
    authPayload = { sub: 'usr_a', username: 'Ripley' },
  } = opts;

  const memory = new Map<string, ShipState>();
  const boardCalls: ShipState[] = [];

  const shipStateService = {
    get: (userid: string, shipno: number): ShipState | undefined =>
      memory.get(`${userid}:${shipno}`),
    board: (state: ShipState): void => {
      boardCalls.push(state);
      if (!boardIsNoop) memory.set(`${state.userid}:${state.shipno}`, state);
    },
    findAllShips: (): ShipState[] => seated,
    findByUserid: (): ShipState[] => [],
    unboard: jest.fn().mockResolvedValue(undefined),
    flushAndUnload: jest.fn().mockResolvedValue(undefined),
    removeFromGame: jest.fn(),
    mutate: jest.fn(),
  } as unknown as ShipStateService;

  const shipFindMany = jest.fn().mockResolvedValue(ships);
  const userFindUnique = jest.fn().mockResolvedValue(userRow);
  const prisma = {
    ship: { findMany: shipFindMany, findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    user: { findUnique: userFindUnique },
    shipClass: { findFirst: jest.fn().mockResolvedValue({ maxTons: 5000, points: 100 }) },
    mailStat: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const validate = jest.fn().mockResolvedValue(authPayload);
  const finalize = jest.fn();
  const onboarding = {
    finalize,
    validateNameReply: jest.fn().mockReturnValue(true),
    buildClassListPayload: jest.fn().mockResolvedValue([]),
  } as unknown as OnboardingService;

  const dispatched: unknown[] = [];
  const dispatch = jest.fn().mockImplementation((input: unknown) => {
    dispatched.push(input);
    return Promise.resolve({ lines: [] });
  });
  const registry = new ConnectedShipsRegistry(shipStateService);
  const presence = new PresenceService();

  const gateway = new GameGateway(
    shipStateService,
    { dispatch } as unknown as CommandRouterService,
    registry,
    { validate } as unknown as WsAuthGuard,
    prisma,
    onboarding,
    { clearScantab: jest.fn() } as unknown as ScanHandlerService,
    {
      getTypeName: (): string => 'Interceptor',
      getMaxTons: (): number => 5000,
    } as unknown as ShipClassCacheService,
    mockRandom,
    { emit: jest.fn(), on: jest.fn() } as never,
    presence,
  );

  const liveSockets = new Map<string, FakeSocket>();
  (gateway as unknown as { server: unknown }).server = {
    emit: jest.fn(),
    to: () => ({ emit: (): void => undefined, except: () => noopEmitter }),
    except: () => ({ emit: (): void => undefined, to: () => noopEmitter }),
    sockets: { sockets: liveSockets, adapter: { rooms: new Map<string, Set<string>>() } },
  };

  /** Connect a socket the way Socket.io would: register it, then hand it over. */
  const connect = async (id: string, userid = 'usr_a'): Promise<FakeSocket> => {
    const sock = makeSocket(id);
    sock.handshake.query.userid = userid;
    liveSockets.set(id, sock);
    validate.mockResolvedValueOnce(
      authPayload === null ? null : { sub: userid, username: userid },
    );
    await gateway.handleConnection(sock as never);
    return sock;
  };

  return {
    gateway,
    registry,
    presence,
    memory,
    boardCalls,
    liveSockets,
    connect,
    shipFindMany,
    userFindUnique,
    validate,
    finalize,
    dispatch,
    dispatched,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// The handshake guard
// ───────────────────────────────────────────────────────────────────────────

describe('the handshake guard', () => {
  it('a rejected socket never becomes a player', async () => {
    // The guard has already disconnected it; handleConnection must stop dead.
    // If it did not, an unauthenticated socket would be handed a `userid` of
    // `undefined` and every downstream lookup would key off it.
    const h = build({ authPayload: null });
    const sock = await h.connect('sock-x');

    expect(sock.data.userid).toBeUndefined();
    expect(h.presence.count()).toBe(0);
    expect(h.shipFindMany).not.toHaveBeenCalled();
    expect(sock.emitted).toEqual([]);
  });

  it('an accepted socket is stamped with its account before anything else runs', async () => {
    const h = build();
    const sock = await h.connect('sock-1', 'usr_a');

    expect(sock.data.userid).toBe('usr_a');
    expect(h.presence.has('usr_a')).toBe(true);
    expect(h.shipFindMany).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The per-account socket cap, through its caller
// ───────────────────────────────────────────────────────────────────────────

describe('the per-account socket cap', () => {
  it('lets an account hold four tabs open without touching any of them', async () => {
    const h = build();
    const socks = [
      await h.connect('s0'),
      await h.connect('s1'),
      await h.connect('s2'),
      await h.connect('s3'),
    ];

    expect(socks.flatMap((s) => s.disconnectCalls)).toEqual([]);
  });

  it('the fifth tab closes the OLDEST, never the arrival', async () => {
    const h = build();
    const s0 = await h.connect('s0');
    const s1 = await h.connect('s1');
    const s2 = await h.connect('s2');
    const s3 = await h.connect('s3');
    const s4 = await h.connect('s4');

    expect(s0.disconnectCalls).toEqual([true]);
    expect(s1.disconnectCalls).toEqual([]);
    expect(s2.disconnectCalls).toEqual([]);
    expect(s3.disconnectCalls).toEqual([]);
    // The arriving socket must survive, or a player's own stale tabs lock them
    // out of their own account.
    expect(s4.disconnectCalls).toEqual([]);
    expect(s4.connected).toBe(true);
  });

  it('the arrival is recorded, so the next tab evicts the SECOND-oldest', async () => {
    // This is the half `socket-cap-per-account.spec.ts` cannot see. The helper
    // is pure; if the gateway forgot to write the new list back, or wrote it
    // without the arriving id, s0 would be evicted twice and s1 would live
    // forever while newer tabs kept dying.
    const h = build();
    const s0 = await h.connect('s0');
    const s1 = await h.connect('s1');
    await h.connect('s2');
    await h.connect('s3');
    await h.connect('s4');
    await h.connect('s5');

    expect(s0.disconnectCalls).toEqual([true]);
    expect(s1.disconnectCalls).toEqual([true]);
  });

  it('the cap is per ACCOUNT — a busy server does not evict a quiet player', async () => {
    const h = build();
    const a = await h.connect('a0', 'usr_a');
    for (const id of ['b0', 'b1', 'b2', 'b3']) await h.connect(id, 'usr_b');

    expect(a.disconnectCalls).toEqual([]);
    expect(a.connected).toBe(true);
  });

  it('a closed tab gives its slot back', async () => {
    // Without the prune in handleDisconnect, a player who closes and reopens
    // one tab four times has "four sockets" the server can no longer reach,
    // and the fifth honest reconnect kills a tab they are actively flying.
    const h = build();
    const s0 = await h.connect('s0');
    const s1 = await h.connect('s1');
    await h.connect('s2');
    await h.connect('s3');

    await h.gateway.handleDisconnect(s0 as never);
    const s4 = await h.connect('s4');

    expect(s1.disconnectCalls).toEqual([]);
    expect(s4.disconnectCalls).toEqual([]);
  });

  it('another account logging off does not reset your tab count', async () => {
    // Guards the pruning being keyed to the departing user: a `clear()` here
    // would let every account start again from zero whenever anybody left.
    const h = build();
    const b0 = await h.connect('b0', 'usr_b');
    await h.connect('b1', 'usr_b');
    await h.connect('b2', 'usr_b');
    await h.connect('b3', 'usr_b');

    const a0 = await h.connect('a0', 'usr_a');
    await h.gateway.handleDisconnect(a0 as never);

    await h.connect('b4', 'usr_b');

    expect(b0.disconnectCalls).toEqual([true]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The seat gate — GEMAIN.C:2769 `if (numwar < gemaxplrs)`
// ───────────────────────────────────────────────────────────────────────────

describe('the MAXPLRS seat gate', () => {
  const others = (n: number, status: number = GESTAT_USER): ShipState[] =>
    Array.from({ length: n }, (_, i) => seatedShip(`usr_other_${i}`, 1, status));

  it('refuses entry once every seat is taken, and does not read the fleet', async () => {
    const h = build({ seated: others(MAXPLRS) });
    const sock = await h.connect('s1');

    const log = payloadOf(sock, 'event.log') as { text: string } | undefined;
    expect(log?.text).toContain('The game is full');
    expect(log?.text).toContain(`${MAXPLRS}/${MAXPLRS}`);
    expect(sock.disconnectCalls).toEqual([true]);
    // Refused BEFORE the two Prisma queries the entry path would run.
    expect(h.shipFindMany).not.toHaveBeenCalled();
  });

  it('one seat short is still a seat', async () => {
    const h = build({ seated: others(MAXPLRS - 1) });
    const sock = await h.connect('s1');

    expect(events(sock)).not.toContain('event.log');
    expect(sock.disconnectCalls).toEqual([]);
    expect(h.shipFindMany).toHaveBeenCalledTimes(1);
  });

  it('AI hulls do not occupy player seats', async () => {
    // Cybertrons and droids carry GESTAT_AUTO and live in the same table.
    // Counting them would make a galaxy with a full AI population read as
    // permanently full, and no player could ever board again.
    const h = build({ seated: others(MAXPLRS + 5, GESTAT_AUTO) });
    const sock = await h.connect('s1');

    expect(events(sock)).not.toContain('event.log');
    expect(sock.disconnectCalls).toEqual([]);
    expect(h.shipFindMany).toHaveBeenCalledTimes(1);
  });

  it('a captain is never locked out by his own hulls', async () => {
    // The gate counts seats held by OTHER accounts. Without the `userid`
    // exclusion, a multi-ship captain reconnecting to a busy game would be
    // refused by his own fleet.
    const h = build({
      seated: [
        ...others(MAXPLRS - 1),
        seatedShip('usr_a', 1, GESTAT_USER),
        seatedShip('usr_a', 2, GESTAT_USER),
        seatedShip('usr_a', 3, GESTAT_USER),
      ],
    });
    const sock = await h.connect('s1', 'usr_a');

    expect(events(sock)).not.toContain('event.log');
    expect(sock.disconnectCalls).toEqual([]);
    expect(h.shipFindMany).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Entry when the account row is gone
// ───────────────────────────────────────────────────────────────────────────

describe('entry with a valid token for an account that no longer exists', () => {
  it('logs the client out instead of dropping it into onboarding', async () => {
    // A signed JWT outlives its User row after a DB reset. Onboarding would
    // then run finalize() against a missing row and throw mid-flow, leaving
    // the pilot at a prompt that can never be answered.
    const h = build({ ships: [], userRow: null });
    const sock = await h.connect('s1');

    expect(payloadOf(sock, 'auth:logout')).toEqual({
      reason: 'Account not found. Please register again.',
    });
    expect(events(sock)).not.toContain('prompt:ship-name');
    expect(sock.disconnectCalls).toEqual([true]);
  });

  it('a real account with no hull gets the ship-name prompt and stays connected', async () => {
    const h = build({ ships: [] });
    const sock = await h.connect('s1');

    expect(events(sock)).toContain('prompt:ship-name');
    expect(events(sock)).not.toContain('auth:logout');
    expect(sock.disconnectCalls).toEqual([]);
    expect(sock.data.onboarding).toEqual({ step: 'AWAITING_NAME' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The two refusals inside boarding
// ───────────────────────────────────────────────────────────────────────────

describe('boarding a hull on connect', () => {
  it('will not resurrect a hull at 100% damage', async () => {
    // The delete-model removes a dead hull from the world; a row that survives
    // is a race with the delete that has not landed yet. Hydrating it would
    // rewrite it to full health and hand a destroyed ship back to its owner.
    const h = build({ ships: [makeShipRow({ damage: 100 })] });
    const sock = await h.connect('s1');

    expect(payloadOf(sock, 'error')).toEqual({
      code: 'SHIP_DESTROYED',
      message: 'That ship has been destroyed.',
    });
    expect(h.boardCalls).toEqual([]);
    expect(h.memory.size).toBe(0);
    expect(sock.data.activeShipNo).toBeUndefined();
    expect(h.registry.getSocketId('usr_a:1')).toBeUndefined();
    expect(events(sock)).not.toContain('command:result');
  });

  it('a badly damaged but living hull still boards', async () => {
    // The boundary partner: 99 is flyable, and canon's own repair loop exists
    // precisely so a pilot can nurse one home.
    const h = build({ ships: [makeShipRow({ damage: 99 })] });
    const sock = await h.connect('s1');

    expect(h.boardCalls).toHaveLength(1);
    expect(sock.data.activeShipNo).toBe(1);
    expect(h.registry.getSocketId('usr_a:1')).toBe('s1');
    expect(events(sock)).toContain('command:result');
    expect(sock.joinedRooms).toEqual(['user:usr_a', 'sector:5:3']);
  });

  it('a hull that fails to land in memory disconnects the client', async () => {
    // Otherwise the socket is marked as flying shipno 1 (activeShipNo is set
    // before this check) while nothing exists behind it, and every command
    // answers "No active ship" for the rest of the session.
    const h = build({ ships: [makeShipRow()], boardIsNoop: true });
    const sock = await h.connect('s1');

    expect(payloadOf(sock, 'error')).toEqual({
      code: 'NO_SHIP',
      message: 'Failed to load ship.',
    });
    expect(sock.disconnectCalls).toEqual([true]);
    expect(events(sock)).not.toContain('command:result');
    expect(sock.joinedRooms).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prompt:reply outside onboarding
// ───────────────────────────────────────────────────────────────────────────

describe('prompt replies from sockets that are not onboarding', () => {
  it('a pilot already flying cannot mint a second ship with a stray reply', async () => {
    // finalize() creates a hull and credits a starting balance. A socket that
    // is aboard has no onboarding state, and must be refused rather than run
    // through the new-player path a second time.
    const h = build();
    const sock = makeSocket('s1');
    sock.data.userid = 'usr_a';
    sock.data.activeShipNo = 1;

    await h.gateway.handlePromptReply(sock as never, { value: 'Freebie' });

    expect(payloadOf(sock, 'error')).toEqual({
      code: 'NOT_IN_ONBOARDING',
      message: 'Not in onboarding.',
    });
    expect(h.finalize).not.toHaveBeenCalled();
  });

  it('an unauthenticated socket in onboarding state cannot finalize', async () => {
    // The `!userid` half of the guard. Without it finalize() would be called
    // with `undefined` as the account, which is a write keyed off nothing.
    const h = build();
    const sock = makeSocket('s1');
    sock.data.onboarding = { step: 'AWAITING_NAME' };

    await h.gateway.handlePromptReply(sock as never, { value: 'Freebie' });

    expect(payloadOf(sock, 'error')).toEqual({
      code: 'NOT_IN_ONBOARDING',
      message: 'Not in onboarding.',
    });
    expect(h.finalize).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Command payloads from an untrusted client
// ───────────────────────────────────────────────────────────────────────────

describe('the command payload', () => {
  it('a non-string input reaches the router as an empty string, not as itself', async () => {
    // `body.input` is typed `unknown` because it arrives off the wire. A
    // client sending `{ input: { } }` must not have that object handed to a
    // handler that will call `.trim()` on it and take the socket's command
    // chain down with it.
    const h = build({ ships: [makeShipRow()] });
    const sock = await h.connect('s1');

    h.gateway.handleCommand(sock as never, { input: { evil: true } });
    await (sock.data.commandChain as Promise<void>);

    expect(h.dispatched).toEqual(['']);
  });

  it('a real command is passed through untouched', async () => {
    const h = build({ ships: [makeShipRow()] });
    const sock = await h.connect('s1');

    h.gateway.handleCommand(sock as never, { input: 'pha 75' });
    await (sock.data.commandChain as Promise<void>);

    expect(h.dispatched).toEqual(['pha 75']);
  });
});
