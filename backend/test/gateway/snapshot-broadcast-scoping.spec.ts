import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * The rebroadcast after a rename must not hand out everyone's position.
 *
 * `ren` and all five `tea` subcommands return a `__player_snapshot__` sentinel
 * so the roster picks up the new name (rename.handler.ts:82-84,
 * tea.handler.ts:143 and four more). The gateway resolved it with a bare
 * `server.emit('player.snapshot', { players: this.registry.list() })` —
 * and `registry.list()` fills in every ship's real sector, by design: its own
 * doc says `scopePlayers()` is what blanks it.
 *
 * So the v0.8.0 scoping work had a hole. Any player could type `ren A`, `ren B`,
 * `ren A` … and pull a live, unscoped position feed for every connected pilot —
 * exact sector, unlimited range, no scan notice to the targets. A pilot who
 * never renames leaked everyone's position to everyone whenever they touched a
 * team command.
 *
 * Found by the 2026-09-09 security review (M3).
 * @see docs/audits/2026-09-09-security-review.md
 */
describe('GameGateway — the roster rebroadcast is scoped per recipient', () => {
  type Sock = { id: string; data: Record<string, unknown>; emit: Mock };

  let gateway: GameGateway;
  let sockets: Map<string, Sock>;
  let serverEmit: Mock;

  /** A connected pilot: a socket, a ship at (x,y), and a registry entry. */
  const ships = new Map<string, { userid: string; shipno: number; shipname: string; shpclass: number; xcoord: number; ycoord: number }>();

  const addPlayer = (userid: string, x: number, y: number): Sock => {
    const sock: Sock = { id: `sock-${userid}`, data: { userid, activeShipNo: 1 }, emit: vi.fn() };
    sockets.set(sock.id, sock);
    ships.set(`${userid}:1`, { userid, shipno: 1, shipname: `Ship-${userid}`, shpclass: 1, xcoord: x, ycoord: y });
    return sock;
  };

  const snapshotsTo = (sock: Sock) =>
    sock.emit.mock.calls.filter((c) => c[0] === 'player.snapshot')
      .map((c) => c[1] as { players: { shipId: string; sector: { x: number; y: number } | null }[] });

  beforeEach(() => {
    sockets = new Map();
    ships.clear();
    serverEmit = vi.fn();

    const shipStateService = {
      findAllShips: () => [...ships.values()],
      findByUserid: () => [],
      get: (u: string, n: number) => ships.get(`${u}:${n}`),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    gateway = makeGateway({
      shipStateService,
      registry,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmit,
      to: () => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) }),
      sockets: { sockets, adapter: { rooms: new Map() } },
    };
    (gateway as unknown as { registry: ConnectedShipsRegistry }).registry = registry;
  });

  const fire = () =>
    (gateway as unknown as { processBroadcasts: (r: unknown, c?: unknown) => void })
      .processBroadcasts({
        lines: [],
        broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
      });

  const register = (sock: Sock, userid: string) =>
    (gateway as unknown as { registry: ConnectedShipsRegistry }).registry.upsert(`${userid}:1`, sock.id);

  it('never blasts the unscoped roster to every socket', () => {
    const a = addPlayer('alpha', 5, 3);
    register(a, 'alpha');
    addPlayer('bravo', -12, 40);
    register(sockets.get('sock-bravo') as Sock, 'bravo');

    fire();

    expect(serverEmit.mock.calls.filter((c) => c[0] === 'player.snapshot')).toHaveLength(0);
  });

  it('withholds the sector of a pilot in a different part of the galaxy', () => {
    const a = addPlayer('alpha', 5, 3);
    register(a, 'alpha');
    const b = addPlayer('bravo', -12, 40);
    register(b, 'bravo');

    fire();

    const [payload] = snapshotsTo(a);
    expect(payload).toBeDefined();
    const bravo = payload.players.find((p) => p.shipId === 'bravo:1');
    expect(bravo?.sector).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('-12');
  });

  it('keeps the sector of a pilot sharing the recipient’s own', () => {
    const a = addPlayer('alpha', 5.7, 3.2);
    register(a, 'alpha');
    const b = addPlayer('bravo', 5.1, 3.9);
    register(b, 'bravo');

    fire();

    const [payload] = snapshotsTo(a);
    expect(payload.players.find((p) => p.shipId === 'bravo:1')?.sector).toEqual({ x: 5, y: 3 });
  });

  it('gives every connected pilot their own view, not one shared payload', () => {
    const a = addPlayer('alpha', 5, 3);
    register(a, 'alpha');
    const b = addPlayer('bravo', -12, 40);
    register(b, 'bravo');

    fire();

    // Each sees themselves; neither sees the other.
    expect(snapshotsTo(a)[0].players.find((p) => p.shipId === 'alpha:1')?.sector).toEqual({ x: 5, y: 3 });
    expect(snapshotsTo(b)[0].players.find((p) => p.shipId === 'bravo:1')?.sector).toEqual({ x: -12, y: 40 });
    expect(snapshotsTo(a)[0].players.find((p) => p.shipId === 'bravo:1')?.sector).toBeNull();
    expect(snapshotsTo(b)[0].players.find((p) => p.shipId === 'alpha:1')?.sector).toBeNull();
  });

  it('skips a socket with no ship rather than throwing mid-fan-out', () => {
    // An onboarding socket is connected but not yet bound to a hull.
    const a = addPlayer('alpha', 5, 3);
    register(a, 'alpha');
    const orphan: Sock = { id: 'sock-orphan', data: {}, emit: vi.fn() };
    sockets.set(orphan.id, orphan);

    expect(() => fire()).not.toThrow();
    expect(snapshotsTo(orphan)).toHaveLength(0);
    expect(snapshotsTo(a)).toHaveLength(1);
  });
});
