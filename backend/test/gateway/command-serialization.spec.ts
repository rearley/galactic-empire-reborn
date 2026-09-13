import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * One command at a time, per player.
 *
 * `handleCommand` fired `dispatch` and only `.then()`-ed the result, so a
 * handler that awaits the database released control and the NEXT command from
 * the same socket started immediately. Two commands were then half-done at
 * once, both working from state read before either had written anything.
 *
 * Part B closed the two ways that was exploitable — cash and cargo are now
 * guarded where the data lives, so they hold however the timing falls. This is
 * Part A, and after B it buys three narrower things:
 *
 *   - commands COMPLETE IN THE ORDER TYPED, which canon got for free by running
 *     one command per player at a time
 *   - the ship is re-read after the previous command finished, so `x` followed
 *     by anything cannot act on a hull that has just been left
 *   - a future async handler is safe by default, rather than only if whoever
 *     wrote it remembered to make its read-and-write atomic
 *
 * What it deliberately does NOT cover: the 1-second and 6-second ticks, which
 * mutate ship state on timers and were never in this queue. Only invariants at
 * the data layer hold against those. @see docs/DECISIONS.md 2026-09-09
 */
describe('GameGateway — commands from one socket run one at a time', () => {
  type Sock = {
    id: string; data: Record<string, unknown>; emit: Mock;
    broadcast: { emit: Mock; to: () => { emit: Mock }; except: () => { emit: Mock } };
  };

  const makeSocket = (id: string, userid: string): Sock => ({
    id,
    data: { userid, activeShipNo: 1 },
    emit: vi.fn(),
    broadcast: { emit: vi.fn(), to: () => ({ emit: vi.fn() }), except: () => ({ emit: vi.fn() }) },
  });

  /** A router whose handlers resolve only when the test says so. */
  function build() {
    const started: string[] = [];
    const finished: string[] = [];
    const gates = new Map<string, () => void>();

    const dispatch = vi.fn((input: string) => {
      started.push(input);
      return new Promise<{ lines: { text: string; category: string }[] }>((resolve) => {
        gates.set(input, () => {
          finished.push(input);
          resolve({ lines: [{ text: `done:${input}`, category: 'info' }] });
        });
      });
    });

    const ship = { userid: 'u1', shipno: 1, shipname: 'S', items: [] };
    const shipStateService = {
      get: () => ship,
      findAllShips: () => [ship],
      findByUserid: () => [ship],
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      commandRouter: { dispatch } as unknown as CommandRouterService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: () => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) }),
      except: () => ({ emit: vi.fn() }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };

    return { gateway, started, finished, gates, dispatch };
  }

  /** Let queued microtasks run. */
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

  it('does not start the second command while the first is still running', async () => {
    const { gateway, started, gates } = build();
    const sock = makeSocket('s1', 'u1');

    gateway.handleCommand(sock as never, { input: 'first' });
    gateway.handleCommand(sock as never, { input: 'second' });
    await settle();

    expect(started).toEqual(['first']);

    gates.get('first')!();
    await settle();
    expect(started).toEqual(['first', 'second']);
  });

  it('completes them in the order they were typed', async () => {
    const { gateway, finished, gates } = build();
    const sock = makeSocket('s1', 'u1');

    gateway.handleCommand(sock as never, { input: 'a' });
    gateway.handleCommand(sock as never, { input: 'b' });
    gateway.handleCommand(sock as never, { input: 'c' });
    await settle();

    gates.get('a')!(); await settle();
    gates.get('b')!(); await settle();
    gates.get('c')!(); await settle();

    expect(finished).toEqual(['a', 'b', 'c']);
  });

  it('a failing command does not wedge the queue behind it', async () => {
    // THE risk this change introduces: one stuck link and that player can never
    // type again. A rejection must move the queue on, not stop it.
    const { gateway, started } = build();
    const sock = makeSocket('s1', 'u1');
    const boom = vi.fn().mockRejectedValue(new Error('handler exploded'));
    (gateway as unknown as { commandRouter: { dispatch: unknown } }).commandRouter.dispatch = boom;

    gateway.handleCommand(sock as never, { input: 'bad' });
    await settle();

    // Restore a working router; the next command must still be served.
    (gateway as unknown as { commandRouter: { dispatch: unknown } }).commandRouter.dispatch =
      vi.fn((input: string) => { started.push(input); return Promise.resolve({ lines: [] }); });
    gateway.handleCommand(sock as never, { input: 'after' });
    await settle();

    expect(started).toContain('after');
  });

  it('does not make one player wait behind another', async () => {
    // The queue is per SOCKET. Two pilots must never block each other.
    const { gateway, started, gates } = build();
    const a = makeSocket('s1', 'u1');
    const b = makeSocket('s2', 'u2');

    gateway.handleCommand(a as never, { input: 'alpha' });
    gateway.handleCommand(b as never, { input: 'bravo' });
    await settle();

    expect(started).toEqual(['alpha', 'bravo']);
    gates.get('alpha')!(); gates.get('bravo')!();
  });

  it('re-reads the ship after the previous command, not before it', async () => {
    // `x` unboards. A second command queued behind it must not act on the hull
    // the player has just left — so the lookup belongs inside the queued unit.
    const { gateway, gates } = build();
    const sock = makeSocket('s1', 'u1');
    let shipGone = false;
    (gateway as unknown as { shipStateService: { get: unknown } }).shipStateService.get =
      () => (shipGone ? undefined : { userid: 'u1', shipno: 1, shipname: 'S', items: [] });

    gateway.handleCommand(sock as never, { input: 'first' });
    gateway.handleCommand(sock as never, { input: 'second' });
    await settle();

    shipGone = true;              // the first command unboarded us
    gates.get('first')!();
    await settle();

    const said = sock.emit.mock.calls
      .filter((c) => c[0] === 'command:result')
      .flatMap((c) => (c[1] as { lines: { text: string }[] }).lines.map((l) => l.text));
    expect(said).toContain('No active ship.');
  });
});
