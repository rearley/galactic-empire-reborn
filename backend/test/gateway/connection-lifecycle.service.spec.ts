/**
 * The connection lifecycle, tested without a Socket.io server.
 *
 * This region decides whether a player gets into the game, which ship they fly,
 * and — on the way out — whether dropping the connection costs them the hull.
 * Every one of those is a side effect performed under a guard, and the guards
 * are the whole content: `presence.arrive` only after the JWT validates, the
 * rage-quit kill only for a CLIENT-side reason, the unboard only when this
 * socket is still the registered owner.
 *
 * One case per side effect, so a move that keeps the code and loses a guard
 * fails here rather than in play.
 */
import 'reflect-metadata';
import {
  ConnectionLifecycleService,
  LifecycleHost,
} from '../../src/gateway/connection-lifecycle.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { PresenceService } from '../../src/public/presence.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Random } from '../../src/game/combat/random.port';
import { COMBAT_SHIP_DESTROYED } from '../../src/game/combat/combat-events';
import { MAX_SOCKETS_PER_USER } from '../../src/gateway/socket-cap';
import { MAXPLRS, GESTAT_USER } from '../../src/game/constants';
import { SHIP_STATUS_ABANDONED } from '../../src/game/commands/_ship-management-constants';
import type { GameSocket } from '../../src/gateway/game.gateway';

const USERID = 'u1';

function makeSocket(id = 'sock-1', data: Record<string, unknown> = {}) {
  const emit = jest.fn();
  return {
    id,
    connected: true,
    data,
    emit,
    on: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    broadcast: {
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
      except: jest.fn(() => ({ emit: jest.fn() })),
    },
    handshake: { query: { userid: USERID } },
  };
}

type Sock = ReturnType<typeof makeSocket>;
const events = (s: Sock): string[] => s.emit.mock.calls.map((c) => String(c[0]));

function makeHost(sockets: Map<string, unknown> = new Map()) {
  const serverEmit = jest.fn();
  const exceptEmit = jest.fn();
  const toEmit = jest.fn();
  const to = jest.fn(() => ({ emit: toEmit, except: jest.fn(() => ({ emit: exceptEmit })) }));
  const server = {
    emit: serverEmit,
    to,
    except: jest.fn(() => ({ emit: exceptEmit })),
    sockets: { sockets },
  };
  const host: LifecycleHost = {
    get server() {
      return server as never;
    },
    log: jest.fn(),
    error: jest.fn(),
  };
  return { host, server, serverEmit, exceptEmit, toEmit };
}

interface Deps {
  shipStateService: Partial<ShipStateService>;
  registry: ConnectedShipsRegistry;
  wsAuthGuard: { validate: jest.Mock };
  prisma: Record<string, unknown>;
  scanHandler: { clearScantab: jest.Mock; lettersFor: jest.Mock };
  shipClassCache: Partial<ShipClassCacheService>;
  random: Random;
  eventsBus: { emit: jest.Mock };
  presence: PresenceService;
}

function build(over: Partial<Deps> = {}) {
  const shipStateService = (over.shipStateService ?? {
    get: jest.fn(),
    findAllShips: jest.fn(() => []),
    board: jest.fn(),
    unboard: jest.fn().mockResolvedValue(undefined),
    mutate: jest.fn(),
  }) as unknown as ShipStateService;
  const registry = over.registry ?? new ConnectedShipsRegistry(shipStateService);
  const wsAuthGuard = over.wsAuthGuard ?? { validate: jest.fn().mockResolvedValue({ sub: USERID, username: 'Ripley' }) };
  const prisma = (over.prisma ?? {
    ship: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ userid: USERID }) },
    mailStat: { findFirst: jest.fn().mockResolvedValue(null) },
    shipClass: { findFirst: jest.fn().mockResolvedValue(null) },
  }) as unknown as PrismaService;
  const scanHandler = (over.scanHandler ?? { clearScantab: jest.fn(), lettersFor: jest.fn(() => []) }) as unknown as ScanHandlerService;
  const shipClassCache = (over.shipClassCache ?? {
    getTypeName: jest.fn(() => 'Interceptor'),
    getMaxTons: jest.fn(() => 1000),
  }) as unknown as ShipClassCacheService;
  const random = over.random ?? ({ next: jest.fn(() => 0) } as unknown as Random);
  const eventsBus = over.eventsBus ?? { emit: jest.fn() };
  const presence = over.presence ?? new PresenceService();

  const svc = new ConnectionLifecycleService(
    shipStateService,
    registry,
    wsAuthGuard as unknown as WsAuthGuard,
    prisma,
    scanHandler,
    shipClassCache,
    random,
    eventsBus as unknown as EventEmitter2,
    presence,
  );
  return { svc, shipStateService, registry, wsAuthGuard, prisma, scanHandler, shipClassCache, random, eventsBus, presence };
}

const shipRow = (shipno = 1, extra: Record<string, unknown> = {}) => ({
  userid: USERID,
  shipno,
  shipname: `Ship${shipno}`,
  shpclass: 1,
  xcoord: 5.5,
  ycoord: 3.5,
  damage: 0,
  energy: 1000,
  heading: 0,
  speed: 0,
  where: 0,
  status: GESTAT_USER,
  items: new Array<bigint>(16).fill(0n),
  ...extra,
});

const liveShip = (extra: Record<string, unknown> = {}) => ({
  userid: USERID,
  shipno: 1,
  shipname: 'Ship1',
  shpclass: 1,
  xcoord: 5.5,
  ycoord: 3.5,
  cantexit: 0,
  lastfired: 255,
  status: 1,
  channel: 4,
  cloak: 0,
  username: 'Ripley',
  fkeys: [],
  items: new Array<bigint>(14).fill(0n),
  ...extra,
});

describe('ConnectionLifecycleService — connect', () => {
  it('logs the arrival and installs the disconnect-reason listener before auth', async () => {
    const { svc, wsAuthGuard } = build();
    wsAuthGuard.validate.mockResolvedValue(null);
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.onConnect(host, sock as unknown as GameSocket);

    expect(host.log).toHaveBeenCalledWith('connection sock-1');
    // Registered even for a socket the guard is about to reject: the listener
    // is what lets handleDisconnect tell a client drop from a server one.
    expect(sock.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('stops dead when the guard rejects — no presence, no ship lookup', async () => {
    const { svc, wsAuthGuard, prisma, presence } = build();
    wsAuthGuard.validate.mockResolvedValue(null);
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.onConnect(host, sock as unknown as GameSocket);

    expect(presence.count()).toBe(0);
    expect((prisma as unknown as { ship: { findMany: jest.Mock } }).ship.findMany).not.toHaveBeenCalled();
    expect(sock.data.userid).toBeUndefined();
  });

  it('records the captain and counts them present once authenticated', async () => {
    const { svc, presence } = build();
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.onConnect(host, sock as unknown as GameSocket);

    expect(sock.data.userid).toBe(USERID);
    expect(sock.data.username).toBe('Ripley');
    expect(presence.count()).toBe(1);
  });

  it('evicts the oldest socket once an account is at the cap, never the newcomer', async () => {
    const { svc } = build();
    const stale: Sock[] = [];
    const sockets = new Map<string, unknown>();
    for (let i = 0; i < MAX_SOCKETS_PER_USER; i++) {
      const s = makeSocket(`old-${i}`);
      stale.push(s);
      sockets.set(s.id, s);
    }
    const { host } = makeHost(sockets);
    for (const s of stale) await svc.onConnect(host, s as unknown as GameSocket);

    const arriving = makeSocket('fresh');
    sockets.set('fresh', arriving);
    await svc.onConnect(host, arriving as unknown as GameSocket);

    expect(stale[0].disconnect).toHaveBeenCalledWith(true);
    expect(stale[1].disconnect).not.toHaveBeenCalled();
    expect(arriving.disconnect).not.toHaveBeenCalled();
  });

  it('refuses a seat when the game is full, and never reaches ship entry', async () => {
    const seated = Array.from({ length: MAXPLRS }, (_, i) => ({
      userid: `other-${i}`,
      shipno: 1,
      status: GESTAT_USER,
    }));
    const { svc, prisma } = build({
      shipStateService: {
        get: jest.fn(),
        findAllShips: jest.fn(() => seated),
      } as unknown as Partial<ShipStateService>,
    });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.onConnect(host, sock as unknown as GameSocket);

    expect(events(sock)).toEqual(['event.log']);
    expect(sock.disconnect).toHaveBeenCalledWith(true);
    expect((prisma as unknown as { ship: { findMany: jest.Mock } }).ship.findMany).not.toHaveBeenCalled();
  });

  it('does not count the arriving captain their own seat', async () => {
    // GEMAIN.C:2769 `if (numwar < gemaxplrs)` counts players in the game; a
    // pilot's own hull must not lock them out of it.
    const seated = Array.from({ length: MAXPLRS }, (_, i) => ({
      userid: i === 0 ? USERID : `other-${i}`,
      shipno: 1,
      status: GESTAT_USER,
    }));
    const { svc, prisma } = build({
      shipStateService: {
        get: jest.fn(),
        findAllShips: jest.fn(() => seated),
      } as unknown as Partial<ShipStateService>,
    });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.onConnect(host, sock as unknown as GameSocket);

    expect(sock.disconnect).not.toHaveBeenCalled();
    expect((prisma as unknown as { ship: { findMany: jest.Mock } }).ship.findMany).toHaveBeenCalled();
  });
});

describe('ConnectionLifecycleService — ship entry', () => {
  function prismaWith(rows: ReturnType<typeof shipRow>[], over: Record<string, unknown> = {}) {
    return {
      ship: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ userid: USERID, options: [0, 0, 0, 0], kills: 0, username: 'Ripley', teamcode: null, fkeys: [] }) },
      mailStat: { findFirst: jest.fn().mockResolvedValue(null) },
      shipClass: { findFirst: jest.fn().mockResolvedValue({ maxTons: 1000, points: 7 }) },
      ...over,
    };
  }

  it('forces a logout when the JWT outlived the account row', async () => {
    const prisma = prismaWith([], { user: { findUnique: jest.fn().mockResolvedValue(null) } });
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(events(sock)).toEqual(['auth:logout']);
    expect(sock.disconnect).toHaveBeenCalledWith(true);
  });

  it('tells an empty-fleet captain they lost a hull, then prompts for a name', async () => {
    const prisma = prismaWith([], {
      mailStat: { findFirst: jest.fn().mockResolvedValue({ name1: 'Zorg', int1: 4, int2: 9 }) },
    });
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(events(sock)).toEqual(['event.log', 'prompt:ship-name']);
    expect(String(sock.emit.mock.calls[0][1].text)).toContain('Zorg');
    expect(sock.data.onboarding).toEqual({ step: 'AWAITING_NAME' });
  });

  it('suppresses the loss notice when the caller asked it to', async () => {
    const prisma = prismaWith([], {
      mailStat: { findFirst: jest.fn().mockResolvedValue({ name1: 'Zorg', int1: 4, int2: 9 }) },
    });
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID, { noticeShipLoss: false });

    expect(prisma.mailStat.findFirst).not.toHaveBeenCalled();
    expect(events(sock)).toEqual(['prompt:ship-name']);
  });

  it('never leaves a captain out of the game when the mailbox lookup fails', async () => {
    const prisma = prismaWith([], {
      mailStat: { findFirst: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(host.error).toHaveBeenCalled();
    expect(events(sock)).toEqual(['prompt:ship-name']);
  });

  it('treats an abandoned hull as no ship at all (FR-702)', async () => {
    const prisma = prismaWith([shipRow(1, { status: SHIP_STATUS_ABANDONED })]);
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(events(sock)).toEqual(['prompt:ship-name']);
  });

  it('auto-boards a lone hull on connect', async () => {
    const prisma = prismaWith([shipRow(1)]);
    const state = liveShip();
    const get = jest.fn().mockReturnValue(state);
    const { svc } = build({
      prisma,
      shipStateService: { get, findAllShips: jest.fn(() => [state]), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(sock.data.activeShipNo).toBe(1);
    expect(events(sock)).toContain('command:result');
  });

  it('offers the menu instead of re-boarding when autoBoard is false', async () => {
    // `x` means leave. @see test/gateway/exit-with-one-ship.spec.ts
    const prisma = prismaWith([shipRow(1)]);
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID, { autoBoard: false });

    expect(events(sock)).toEqual(['prompt:ship-select']);
    expect(sock.data.activeShipNo).toBeUndefined();
  });

  it('presents the menu for a fleet and boards nothing yet', async () => {
    const prisma = prismaWith([shipRow(1), shipRow(2)]);
    const { svc } = build({ prisma });
    const { host } = makeHost();
    const sock = makeSocket();

    await svc.presentShipEntry(host, sock as unknown as GameSocket, USERID);

    expect(events(sock)).toEqual(['prompt:ship-select']);
    expect((sock.data.pendingShipSelect as unknown[]).length).toBe(2);
    expect(sock.data.activeShipNo).toBeUndefined();
  });
});

describe('ConnectionLifecycleService — boarding', () => {
  const prismaOk = () => ({
    ship: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ userid: USERID, options: [0, 0, 0, 0], kills: 3, username: 'Ripley', teamcode: null, fkeys: [] }) },
    mailStat: { findFirst: jest.fn().mockResolvedValue(null) },
    shipClass: { findFirst: jest.fn().mockResolvedValue({ maxTons: 1000, points: 7 }) },
  });

  it('re-boards a single-ship captain without displacing their own socket', async () => {
    // The x-with-one-ship regression: upsert returned the same socket id, which
    // read as a replacement and disconnected the player.
    const state = liveShip();
    const { svc } = build({
      prisma: prismaOk(),
      shipStateService: { get: jest.fn(() => state), findAllShips: jest.fn(() => [state]), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const sock = makeSocket();
    const { host, serverEmit } = makeHost(new Map([['sock-1', sock]]));

    await svc.boardShipAndWelcome(host, sock as unknown as GameSocket, USERID, shipRow(1));
    await svc.boardShipAndWelcome(host, sock as unknown as GameSocket, USERID, shipRow(1));

    expect(sock.disconnect).not.toHaveBeenCalled();
    expect(events(sock)).not.toContain('error');
    expect(serverEmit).not.toHaveBeenCalledWith('player.left', expect.anything());
  });

  it('displaces a genuinely different socket, latest wins', async () => {
    const state = liveShip();
    const { svc } = build({
      prisma: prismaOk(),
      shipStateService: { get: jest.fn(() => state), findAllShips: jest.fn(() => [state]), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const first = makeSocket('sock-1');
    const second = makeSocket('sock-2');
    const { host, serverEmit } = makeHost(new Map<string, unknown>([['sock-1', first], ['sock-2', second]]));

    await svc.boardShipAndWelcome(host, first as unknown as GameSocket, USERID, shipRow(1));
    await svc.boardShipAndWelcome(host, second as unknown as GameSocket, USERID, shipRow(1));

    expect(serverEmit).toHaveBeenCalledWith('player.left', { shipId: `${USERID}:1` });
    expect(events(first)).toContain('error');
    expect(first.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses to resurrect a hull that is already dead', async () => {
    const { svc } = build({
      prisma: prismaOk(),
      shipStateService: { get: jest.fn(() => undefined), findAllShips: jest.fn(() => []), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const sock = makeSocket();
    const { host } = makeHost(new Map([['sock-1', sock]]));

    await svc.boardShipAndWelcome(host, sock as unknown as GameSocket, USERID, shipRow(1, { damage: 100 }));

    expect(sock.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'SHIP_DESTROYED' }));
    expect(sock.data.activeShipNo).toBeUndefined();
  });

  it('puts a boarded captain in both rooms and announces the arrival', async () => {
    const state = liveShip();
    const { svc } = build({
      prisma: prismaOk(),
      shipStateService: { get: jest.fn(() => state), findAllShips: jest.fn(() => [state]), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const sock = makeSocket();
    const { host } = makeHost(new Map([['sock-1', sock]]));

    await svc.boardShipAndWelcome(host, sock as unknown as GameSocket, USERID, shipRow(1));

    expect(sock.join).toHaveBeenCalledWith(`user:${USERID}`);
    expect(sock.join).toHaveBeenCalledWith('sector:5:3');
    expect(events(sock)).toEqual(['command:result', 'player.snapshot', 'fkeys.snapshot']);
    expect(sock.broadcast.to).toHaveBeenCalledWith('sector:5:3');
  });

  it('says nothing to the galaxy for a fully cloaked arrival', async () => {
    // The test is != 10, not > 0. @see GEFUNCS.C:153 `tossingegame`
    const state = liveShip({ cloak: 10 });
    const { svc } = build({
      prisma: prismaOk(),
      shipStateService: { get: jest.fn(() => state), findAllShips: jest.fn(() => [state]), board: jest.fn() } as unknown as Partial<ShipStateService>,
    });
    const sock = makeSocket();
    const { host, server } = makeHost(new Map([['sock-1', sock]]));

    await svc.boardShipAndWelcome(host, sock as unknown as GameSocket, USERID, shipRow(1));

    expect(server.except).not.toHaveBeenCalled();
  });
});

describe('ConnectionLifecycleService — disconnect', () => {
  function buildDisconnect(ship: ReturnType<typeof liveShip> | undefined, reason?: string) {
    const shipStateService = {
      get: jest.fn(() => ship),
      findAllShips: jest.fn(() => (ship ? [ship] : [])),
      unboard: jest.fn().mockResolvedValue(undefined),
      mutate: jest.fn(),
      board: jest.fn(),
    } as unknown as ShipStateService;
    const registry = new ConnectedShipsRegistry(shipStateService);
    const prisma = {
      ship: { findMany: jest.fn(), findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      mailStat: { findFirst: jest.fn() },
      shipClass: { findFirst: jest.fn().mockResolvedValue({ points: 7 }) },
    };
    const built = build({ shipStateService, registry, prisma });
    const data: Record<string, unknown> = { userid: USERID, activeShipNo: 1 };
    if (reason !== undefined) data.disconnectReason = reason;
    const sock = makeSocket('sock-1', data);
    const host = makeHost(new Map([['sock-1', sock]]));
    return { ...built, sock, ...host };
  }

  it('un-counts the captain and prunes the socket map before anything else', async () => {
    const { svc, host, sock, presence } = buildDisconnect(undefined);
    presence.arrive(USERID);

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(presence.count()).toBe(0);
  });

  it('does not treat a server-side disconnect as a rage-quit kill', async () => {
    // 'server namespace disconnect' is NOT in CLIENT_SIDE_REASONS: a hot reload
    // must never cost a player their ship. @see GEMAIN.C:1397 `warhupa`
    const { svc, host, sock, eventsBus, shipStateService } = buildDisconnect(
      liveShip({ cantexit: 5 }),
      'server namespace disconnect',
    );
    (svc as unknown as { registry: ConnectedShipsRegistry }).registry.upsert(`${USERID}:1`, 'sock-1');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(eventsBus.emit).not.toHaveBeenCalledWith(COMBAT_SHIP_DESTROYED, expect.anything());
    expect(shipStateService.unboard).toHaveBeenCalledWith(USERID, 1);
  });

  it('kills the ship on a client-side drop while combat-locked', async () => {
    const { svc, host, sock, eventsBus, shipStateService } = buildDisconnect(
      liveShip({ cantexit: 5 }),
      'transport close',
    );

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(eventsBus.emit).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ victimId: `${USERID}:1`, victimDisconnectReason: 'transport close' }),
    );
    expect(shipStateService.unboard).not.toHaveBeenCalled();
  });

  it('leaves the ship alone when it was never combat-locked', async () => {
    const { svc, host, sock, eventsBus, shipStateService } = buildDisconnect(liveShip(), 'transport close');
    (svc as unknown as { registry: ConnectedShipsRegistry }).registry.upsert(`${USERID}:1`, 'sock-1');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(eventsBus.emit).not.toHaveBeenCalled();
    expect(shipStateService.unboard).toHaveBeenCalledWith(USERID, 1);
  });

  it('draws no spoils when no attacker can be resolved', async () => {
    // resolveKillSpoils advances the shared random sequence; an unattributed
    // kill must not draw from it.
    const { svc, host, sock, random } = buildDisconnect(liveShip({ cantexit: 5 }), 'transport close');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect((random as unknown as { next: jest.Mock }).next).not.toHaveBeenCalled();
  });

  it('clears the scan table for the departing hull', async () => {
    const { svc, host, sock, scanHandler } = buildDisconnect(liveShip(), 'transport close');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(scanHandler.clearScantab).toHaveBeenCalledWith(USERID, 1);
  });

  it('does not unboard a ship that a newer socket has taken over', async () => {
    const { svc, host, sock, shipStateService } = buildDisconnect(liveShip(), 'transport close');
    (svc as unknown as { registry: ConnectedShipsRegistry }).registry.upsert(`${USERID}:1`, 'sock-2');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(shipStateService.unboard).not.toHaveBeenCalled();
  });

  it('tells the galaxy the ship is gone once its registration goes', async () => {
    const { svc, host, sock, serverEmit } = buildDisconnect(liveShip(), 'transport close');
    (svc as unknown as { registry: ConnectedShipsRegistry }).registry.upsert(`${USERID}:1`, 'sock-1');

    await svc.onDisconnect(host, sock as unknown as GameSocket);

    expect(serverEmit).toHaveBeenCalledWith('player.left', { shipId: `${USERID}:1` });
  });
});
