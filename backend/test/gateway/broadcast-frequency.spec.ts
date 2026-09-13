import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * `outsect`/`outwar` deliver a transmission ONLY to ships carrying the sender's
 * frequency on one of their three channels (GEMAIN.C:2583-2600), and never to
 * the sender. The gateway emitted to the whole room instead, so a tuned channel
 * was audible to anyone in the sector and the sender heard their own message on
 * top of the confirmation.
 */
describe('GameGateway — frequency-filtered broadcasts', () => {
  type Sock = { id: string; data: Record<string, unknown>; emit: Mock };

  let gateway: GameGateway;
  let sockets: Map<string, Sock>;
  let roomMembers: Set<string>;
  let ships: Map<string, { freq: number[]; cloak: number }>;

  const addSocket = (id: string, freq: number[], opts: { inRoom?: boolean; cloak?: number } = {}): Sock => {
    const sock: Sock = { id, data: { userid: id, activeShipNo: 1 }, emit: vi.fn() };
    sockets.set(id, sock);
    ships.set(id, { freq, cloak: opts.cloak ?? 0 });
    if (opts.inRoom !== false) roomMembers.add(id);
    return sock;
  };

  const emitted = (sock: Sock): unknown[][] =>
    sock.emit.mock.calls.filter((c) => c[0] === 'message.send');

  beforeEach(() => {
    sockets = new Map();
    roomMembers = new Set();
    ships = new Map();

    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: (uid: string) => ships.get(uid),
    } as unknown as ShipStateService;

    gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });

    const roomEmit = vi.fn();
    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: () => ({ emit: roomEmit }),
      sockets: {
        sockets,
        adapter: { rooms: new Map([['sector:5:3', roomMembers]]) },
      },
    };
  });

  const send = (broadcast: Record<string, unknown>, senderId?: string): void => {
    const client = senderId ? (sockets.get(senderId) as never) : undefined;
    (gateway as unknown as {
      processBroadcasts: (r: unknown, c?: unknown) => void;
    }).processBroadcasts({ lines: [], broadcasts: [broadcast] }, client);
  };

  it('a sector transmission reaches only ships tuned to the frequency', () => {
    const tuned = addSocket('tuned', [1234, 0, 0]);
    const tunedOnC = addSocket('tunedC', [0, 0, 1234]);
    const untuned = addSocket('untuned', [999, 0, 0]);

    send({ room: 'sector:5:3', event: 'message.send', payload: { text: 'hi' }, freq: 1234 });

    expect(emitted(tuned)).toHaveLength(1);
    expect(emitted(tunedOnC)).toHaveLength(1);
    expect(emitted(untuned)).toHaveLength(0);
  });

  it('does not leak a sector transmission to ships in other sectors', () => {
    const inSector = addSocket('inside', [1234, 0, 0]);
    const elsewhere = addSocket('outside', [1234, 0, 0], { inRoom: false });

    send({ room: 'sector:5:3', event: 'message.send', payload: { text: 'hi' }, freq: 1234 });

    expect(emitted(inSector)).toHaveLength(1);
    expect(emitted(elsewhere)).toHaveLength(0);
  });

  it('a galaxy transmission reaches tuned ships anywhere, but only tuned ones', () => {
    const tuned = addSocket('tuned', [0, 25000, 0], { inRoom: false });
    const untuned = addSocket('untuned', [0, 0, 0], { inRoom: false });

    send({ room: 'galaxy', event: 'message.send', payload: { text: 'hi' }, freq: 25000 });

    expect(emitted(tuned)).toHaveLength(1);
    expect(emitted(untuned)).toHaveLength(0);
  });

  it('excludes the sender — C passes usrnum as the exclude argument', () => {
    const sender = addSocket('sender', [1234, 0, 0]);
    const other = addSocket('other', [1234, 0, 0]);

    send(
      { room: 'sector:5:3', event: 'message.send', payload: { text: 'hi' }, freq: 1234, excludeSelf: true },
      'sender',
    );

    expect(emitted(sender)).toHaveLength(0);
    expect(emitted(other)).toHaveLength(1);
  });

  /**
   * `outwar` (GEMAIN.C:1518-1540) delivers to every `ingegame` ship and never
   * examines cloak — running silent hides you from scanners, not from your own
   * radio. The port dropped hails for cloaked recipients, which made cloaking
   * deafen you; specs/012-social-commands recorded that as matching outwar,
   * which misreads it.
   * @see GECMDS.C:1845
   */
  it('an untagged hail reaches everyone, cloaked or not', () => {
    const a = addSocket('a', [0, 0, 0], { inRoom: false });
    const cloaked = addSocket('cloaked', [0, 0, 0], { inRoom: false, cloak: 1 });

    send({ room: 'hail', event: 'message.send', payload: { text: 'hi' } });

    expect(emitted(a)).toHaveLength(1);
    expect(emitted(cloaked)).toHaveLength(1);
  });
});
