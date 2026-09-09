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
import { scopePlayers, moverVisibilityUpdates } from '../../src/gateway/player-visibility';

/**
 * The client must never be TOLD a position it is not allowed to see.
 *
 * The player panel was a live galaxy-wide position tracker: `player.snapshot`
 * carried every connected player's sector, and `physics.sector-transition` was
 * `server.emit`-ed to every socket carrying the mover's raw x/y — finer than a
 * sector — on every boundary crossing. Hiding that in the UI would leak
 * straight back out through devtools, so the gate belongs on the wire.
 *
 * Canon grants position through `sca` alone: range-gated, and it announces
 * itself to the target. @see src/game/ship/sector-visibility.ts
 */
describe('scopePlayers — a snapshot only carries what the viewer may see', () => {
  const players = [
    { shipId: 'u1:1', name: 'Alpha', sector: { x: 5, y: 3 }, shipClass: 1 },
    { shipId: 'u2:1', name: 'Bravo', sector: { x: 5, y: 3 }, shipClass: 1 },
    { shipId: 'u3:1', name: 'Chuck', sector: { x: -12, y: 40 }, shipClass: 1 },
  ];

  it('keeps the sector of players sharing the viewer’s own', () => {
    const out = scopePlayers(players, { x: 5, y: 3 });
    expect(out.find((p) => p.shipId === 'u2:1')?.sector).toEqual({ x: 5, y: 3 });
  });

  it('nulls the sector of players elsewhere, but keeps them on the roster', () => {
    const out = scopePlayers(players, { x: 5, y: 3 });
    const chuck = out.find((p) => p.shipId === 'u3:1');
    expect(chuck?.name).toBe('Chuck');
    expect(chuck?.sector).toBeNull();
  });

  it('leaks nothing about a hidden player anywhere in the payload', () => {
    const json = JSON.stringify(scopePlayers(players, { x: 5, y: 3 }));
    expect(json).not.toContain('-12');
    expect(json).not.toContain('40');
  });
});

describe('moverVisibilityUpdates — what a mover learns by arriving', () => {
  const players = [
    { shipId: 'mover:1', name: 'Wanderer', sector: { x: 5, y: 3 }, shipClass: 1 },
    { shipId: 'left:1', name: 'LeftBehind', sector: { x: 4, y: 3 }, shipClass: 1 },
    { shipId: 'here:1', name: 'Neighbour', sector: { x: 5, y: 3 }, shipClass: 1 },
    { shipId: 'away:1', name: 'Distant', sector: { x: 90, y: 90 }, shipClass: 1 },
  ];
  const updates = () =>
    moverVisibilityUpdates(players, 'mover:1', { x: 4, y: 3 }, { x: 5, y: 3 });

  it('reveals players in the sector just entered', () => {
    expect(updates()).toContainEqual({ shipId: 'here:1', sector: { x: 5, y: 3 } });
  });

  it('hides players in the sector just left', () => {
    expect(updates()).toContainEqual({ shipId: 'left:1', sector: null });
  });

  it('says nothing about players who were never visible', () => {
    expect(updates().some((u) => u.shipId === 'away:1')).toBe(false);
  });

  it('never includes the mover — their own position is always their own', () => {
    expect(updates().some((u) => u.shipId === 'mover:1')).toBe(false);
  });
});

describe('GameGateway — a transition is not a galaxy-wide position feed', () => {
  const build = () => {
    const moverSocket = {
      id: 'sock-mover', connected: true,
      data: { userid: 'u1', activeShipNo: 1 } as Record<string, unknown>,
      emit: jest.fn(), on: jest.fn(), join: jest.fn(), leave: jest.fn(),
      disconnect: jest.fn(), broadcast: { emit: jest.fn() },
    };
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
    const serverEmit = jest.fn();

    const mover = { userid: 'u1', shipno: 1, shipname: 'Wanderer', speed: 100, shpclass: 1, status: 1, xcoord: 5.02, ycoord: 3.5 };
    const shipStateService = {
      findAllShips: () => [mover],
      findByUserid: () => [mover],
      get: jest.fn().mockReturnValue(mover),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    jest.spyOn(registry, 'getSocketId').mockReturnValue(moverSocket.id);
    jest.spyOn(registry, 'list').mockReturnValue([
      { shipId: 'u1:1', name: 'Wanderer', sector: { x: 5, y: 3 }, shipClass: 1 },
    ]);

    const gateway = new GameGateway(
      shipStateService,
      { dispatch: jest.fn() } as unknown as CommandRouterService,
      registry,
      { validate: jest.fn() } as unknown as WsAuthGuard,
      {} as unknown as PrismaService,
      {} as unknown as OnboardingService,
      { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmit,
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => { roomEmits.push({ room, event, payload }); },
        except: (_id: string) => ({
          emit: (event: string, payload: unknown) => {
            roomEmits.push({ room: `${room}!except`, event, payload });
          },
        }),
      }),
      sockets: { sockets: new Map([[moverSocket.id, moverSocket]]), adapter: { rooms: new Map() } },
    };

    gateway.handleSectorTransition({
      shipId: 'u1:1', fromSector: { x: 4, y: 3 }, toSector: { x: 5, y: 3 },
      x: 5.02, y: 3.5,
    } as never);

    return { moverSocket, roomEmits, serverEmit };
  };

  it('does not broadcast the raw coordinates to every connected client', () => {
    const { serverEmit } = build();
    expect(serverEmit.mock.calls.some((c) => c[0] === 'physics.sector-transition')).toBe(false);
  });

  it('still tells the mover, whose scan map clears on it', () => {
    const { moverSocket } = build();
    expect(moverSocket.emit.mock.calls.some((c) => c[0] === 'physics.sector-transition')).toBe(true);
  });

  it('reveals the arrival to the sector it entered', () => {
    const { roomEmits } = build();
    const e = roomEmits.find((r) => r.room === 'sector:5:3' && r.event === 'player.sector');
    expect(e?.payload).toEqual({ updates: [{ shipId: 'u1:1', sector: { x: 5, y: 3 } }] });
  });

  it('updates the mover\u2019s own row \u2014 they are not yet in the destination room', () => {
    // The socket joins `sector:to` further down handleSectorTransition, so a
    // broadcast to that room does not reach the mover. Without an explicit
    // update their own panel row keeps the sector they just left.
    const { moverSocket } = build();
    const calls = moverSocket.emit.mock.calls.filter((c) => c[0] === 'player.sector');
    const updates = calls.flatMap((c) => (c[1] as { updates: unknown[] }).updates);
    expect(updates).toContainEqual({ shipId: 'u1:1', sector: { x: 5, y: 3 } });
  });

  it('clears the stale position in the sector it left', () => {
    const { roomEmits } = build();
    const e = roomEmits.find((r) => r.room === 'sector:4:3' && r.event === 'player.sector');
    expect(e?.payload).toEqual({ updates: [{ shipId: 'u1:1', sector: null }] });
  });
});
