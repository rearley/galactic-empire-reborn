/**
 * `useSocket` event handlers — the live connection's fourteen callbacks.
 *
 * This hook is the frontend's gateway. Every server event a player depends on
 * mid-flight arrives through one of these handlers, and the failure mode when
 * one is wired wrongly is the worst kind: the banner still says CONNECTED, the
 * roster still renders, and the world silently stops updating. Nothing throws.
 *
 * The reducer these handlers feed (`usePlayerList`) is already covered by
 * `usePlayerList.spec.ts` and `ship-renamed.spec.ts`, which dispatch actions
 * directly. This file deliberately goes through the CALLER instead — socket
 * event in, hook state out — because that is where the two can disagree:
 * a handler registered on the wrong event name, or dispatching the wrong
 * action type, passes every reducer test ever written.
 * @see docs/TEST_STRATEGY.md "Test the caller's arithmetic, not the function's"
 *
 * The socket module is replaced with a recording fake: no network, no timers,
 * no socket.io. Handlers are invoked directly, the way the server would.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../src/socket/useSocket';
import { usePlayerList } from '../src/state/usePlayerList';
import type {
  ConnectedPlayer,
  PlayerSnapshotPayload,
  PhysicsSectorTransitionPayload,
  PlayerSectorPayload,
  ShipRenamedPayload,
} from '../src/types/contracts';

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  connected: boolean;
  on(event: string, handler: Handler): FakeSocket;
  off(event: string, handler: Handler): FakeSocket;
  emit(event: string, ...args: unknown[]): FakeSocket;
  disconnect(): FakeSocket;
}

const fake = vi.hoisted(() => {
  type H = (...args: unknown[]) => void;
  interface S {
    connected: boolean;
    on(event: string, handler: H): S;
    off(event: string, handler: H): S;
    emit(event: string, ...args: unknown[]): S;
    disconnect(): S;
  }

  const handlers = new Map<string, H[]>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const connectCalls = { count: 0 };

  const socket: S = {
    connected: false,
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return socket;
    },
    off(event, handler) {
      const list = handlers.get(event) ?? [];
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
      handlers.set(event, list);
      return socket;
    },
    emit(event, ...args) {
      emitted.push({ event, args });
      return socket;
    },
    disconnect() {
      socket.connected = false;
      return socket;
    },
  };

  return { handlers, emitted, connectCalls, socket };
});

vi.mock('../src/socket/socketClient', () => ({
  socket: fake.socket,
  connectSocket: () => {
    fake.connectCalls.count += 1;
  },
  sendCommand: () => {
    /* not under test here */
  },
  // Mirrors the real onCommandResult: subscribes to `command:result` and
  // returns an unsubscribe. The unmount case below depends on it doing so.
  onCommandResult: (listener: Handler) => {
    fake.socket.on('command:result', listener);
    return () => fake.socket.off('command:result', listener);
  },
}));

const socket = fake.socket as unknown as FakeSocket;

/** Invoke every handler registered for `event`, the way the server would. */
function fire(event: string, ...args: unknown[]): void {
  act(() => {
    for (const handler of [...(fake.handlers.get(event) ?? [])]) handler(...args);
  });
}

function listenerCount(event: string): number {
  return (fake.handlers.get(event) ?? []).length;
}

const ALICE: ConnectedPlayer = {
  shipId: 'alice:1',
  name: 'Defiant',
  sector: { x: 5, y: 3 },
  shipClass: 3,
};
const BOB: ConnectedPlayer = {
  shipId: 'bob:1',
  name: 'Enterprise',
  sector: { x: 10, y: 7 },
  shipClass: 5,
};
const CARL: ConnectedPlayer = {
  shipId: 'carl:1',
  name: 'Zealous',
  sector: { x: 1, y: 1 },
  shipClass: 1,
};

/**
 * The hook as the app actually uses it: the real reducer behind it, so a
 * roster assertion is an assertion about what the player would SEE.
 */
function useHarness() {
  const list = usePlayerList();
  const sock = useSocket(list.dispatch);
  return { players: list.players, ...sock };
}

beforeEach(() => {
  fake.handlers.clear();
  fake.emitted.length = 0;
  fake.connectCalls.count = 0;
  socket.connected = false;
});

describe('useSocket — connection status', () => {
  it('starts as connecting when the socket is not yet open', () => {
    const { result } = renderHook(() => useSocket());
    expect(result.current.status).toBe('connecting');
  });

  it('`connect` puts the banner into connected', () => {
    // Mutation: handleConnect setting anything but 'connected', or the
    // socket.on('connect', …) registration being dropped — the player would
    // sit on "connecting…" forever with a working socket.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    expect(result.current.status).toBe('connected');
  });

  it('`disconnect` puts the banner into disconnected', () => {
    // Mutation: handleDisconnect returning `prev` unconditionally — the client
    // would look connected while receiving nothing, the exact silent freeze.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('disconnect');
    expect(result.current.status).toBe('disconnected');
  });

  it('`reconnect_attempt` shows reconnecting, not disconnected', () => {
    // Mutation: setStatus('disconnected') or 'connecting' in
    // handleReconnectAttempt — reconnecting is the state that tells the player
    // to wait rather than reload and race their own session for the seat.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('reconnect_attempt');
    expect(result.current.status).toBe('reconnecting');
  });

  it('`connect_error` reports disconnected', () => {
    // Mutation: dropping the connect_error registration — a socket that never
    // opens at all would stay on 'connecting' with no error surfaced.
    const { result } = renderHook(() => useSocket());
    fire('connect_error', new Error('xhr poll error'));
    expect(result.current.status).toBe('disconnected');
  });
});

describe('useSocket — a displaced seat is not a network failure', () => {
  it('SESSION_REPLACED moves the banner to displaced', () => {
    // Mutation: comparing against any other code, or dropping the handler —
    // the player would be told the network died when in fact a newer login
    // holds their ship, and `reconnect` is the one action that recovers it.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('error', { code: 'SESSION_REPLACED' });
    expect(result.current.status).toBe('displaced');
  });

  it('the disconnect that follows does NOT overwrite displaced', () => {
    // socketClient calls socket.disconnect() on SESSION_REPLACED, so a
    // `disconnect` event ALWAYS lands immediately after this one. Mutation:
    // dropping the `prev === 'displaced'` guard in handleDisconnect — the
    // displaced banner would be replaced by a generic "disconnected" within
    // the same tick and the player would never learn why.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('error', { code: 'SESSION_REPLACED' });
    fire('disconnect');
    expect(result.current.status).toBe('displaced');
  });

  it('an unrelated server error leaves the banner alone', () => {
    // Mutation: `if (err?.code)` instead of the equality test — every routine
    // server error (NO_SHIP, bad command) would black out the session as
    // displaced and stop the player playing.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('error', { code: 'NO_SHIP' });
    expect(result.current.status).toBe('connected');
  });

  it('reconnect() takes the seat back: connecting, and the socket is re-opened', () => {
    // Mutation: removing setStatus('connecting') — the button would appear
    // dead; removing connectSocket() — the banner would lie about trying.
    const { result } = renderHook(() => useSocket());
    fire('connect');
    fire('error', { code: 'SESSION_REPLACED' });

    act(() => result.current.reconnect());

    expect(result.current.status).toBe('connecting');
    expect(fake.connectCalls.count).toBe(1);
  });
});

describe('useSocket — onboarding prompts', () => {
  it('prompt:ship-name raises the ship-name prompt with the server payload', () => {
    // Mutation: type 'ship-select' here — the fleet menu would be rendered for
    // a captain with no fleet, the reply would be the wrong shape, and the
    // gateway boards nothing: a session with no active ship.
    const { result } = renderHook(() => useSocket());
    fire('prompt:ship-name', { suggested: 'Defiant' });

    expect(result.current.onboardingPrompt).toEqual({
      type: 'ship-name',
      payload: { suggested: 'Defiant' },
    });
  });

  it('prompt:ship-select raises the fleet menu with the server payload', () => {
    // Mutation: type 'ship-name' here, or registering both handlers on one
    // event name — the captain would be asked to name a ship they already own
    // and would never board any of them.
    const { result } = renderHook(() => useSocket());
    fire('prompt:ship-select', { ships: [{ shipId: 'alice:1', name: 'Defiant' }] });

    expect(result.current.onboardingPrompt).toEqual({
      type: 'ship-select',
      payload: { ships: [{ shipId: 'alice:1', name: 'Defiant' }] },
    });
  });

  it('emitPromptReply sends the choice on prompt:reply', () => {
    // Mutation: a different event name, or emitting the bare value instead of
    // { value } — the gateway never receives the selection and the player is
    // stuck at the fleet menu. The emit IS the observable here; there is no
    // resulting hook state.
    const { result } = renderHook(() => useSocket());
    fire('prompt:ship-select', { ships: [] });

    act(() => result.current.emitPromptReply(2));

    expect(fake.emitted).toEqual([{ event: 'prompt:reply', args: [{ value: 2 }] }]);
  });
});

describe('useSocket — player.snapshot', () => {
  it('REPLACES the roster rather than merging into it', () => {
    // A snapshot arrives on every (re)connect. Mutation: dispatching 'JOIN'
    // per player, or a reducer that merges — ships that left while we were
    // away would linger in the roster forever, and the player would target
    // and chase something that is not there.
    const { result } = renderHook(() => useHarness());
    fire('player.joined', ALICE);
    fire('player.joined', BOB);
    expect(result.current.players).toHaveLength(2);

    const snapshot: PlayerSnapshotPayload = { players: [CARL] };
    fire('player.snapshot', snapshot);

    expect(result.current.players.map((p) => p.shipId)).toEqual(['carl:1']);
  });

  it('records selfShipId as the local ship', () => {
    // localShipId decides whether an incoming hit is narrated as happening to
    // YOU or to someone else. Mutation: reading any other field — the player
    // would watch their own ship being destroyed in the third person.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [ALICE], selfShipId: 'alice:1' });

    expect(result.current.localShipId).toBe('alice:1');
  });

  it('a snapshot with no selfShipId does not blank the local ship', () => {
    // Mutation: dropping the `if (payload.selfShipId)` guard — the next
    // roster-only snapshot would set localShipId to undefined and the client
    // would stop recognising its own ship mid-fight.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [ALICE], selfShipId: 'alice:1' });
    fire('player.snapshot', { players: [ALICE, BOB] });

    expect(result.current.localShipId).toBe('alice:1');
  });

  it('clears the onboarding prompt — the snapshot means boarding finished', () => {
    // Mutation: removing setOnboardingPrompt(null) — the fleet menu stays
    // over the terminal after the ship is boarded, so the player cannot type
    // a command while the world is already ticking around their ship.
    const { result } = renderHook(() => useHarness());
    fire('prompt:ship-select', { ships: [] });
    expect(result.current.onboardingPrompt).not.toBeNull();

    fire('player.snapshot', { players: [ALICE], selfShipId: 'alice:1' });

    expect(result.current.onboardingPrompt).toBeNull();
  });
});

describe('useSocket — roster accuracy', () => {
  it('player.joined adds the ship', () => {
    // Mutation: dispatching 'SNAPSHOT' on join (payload shape differs) — the
    // roster would empty every time anyone arrived.
    const { result } = renderHook(() => useHarness());
    fire('player.joined', ALICE);

    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0]).toMatchObject({ shipId: 'alice:1', name: 'Defiant' });
  });

  it('player.left removes only that ship', () => {
    // Mutation: dispatching 'JOIN' on left, or reading the wrong id — a
    // departed ship stays on the list (chased) or a present one vanishes
    // (ambush). Both cost a ship.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [ALICE, BOB] });
    fire('player.left', { shipId: 'alice:1' });

    expect(result.current.players.map((p) => p.shipId)).toEqual(['bob:1']);
  });

  it('physics.sector-transition moves the ship to toSector, not fromSector', () => {
    // Mutation: dispatching with fromSector, or wiring this handler to the
    // 'SECTOR' action (whose payload has `updates`, not `toSector`) — the
    // roster would keep showing a ship in the sector it just LEFT.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [BOB] });

    const transition: PhysicsSectorTransitionPayload = {
      shipId: 'bob:1',
      fromSector: { x: 10, y: 7 },
      toSector: { x: 11, y: 7 },
      x: 34.2,
      y: 21.9,
    };
    fire('physics.sector-transition', transition);

    expect(result.current.players[0].sector).toEqual({ x: 11, y: 7 });
  });

  it('player.sector applies scoped position updates, including going dark', () => {
    // The server sends null for ships we are not allowed to locate. Mutation:
    // wiring this to 'TRANSITION' (which reads payload.shipId) — no update in
    // the batch would land and every position would freeze at its last known
    // value while still being displayed as current.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [ALICE, BOB] });

    const update: PlayerSectorPayload = {
      updates: [
        { shipId: 'alice:1', sector: { x: 6, y: 3 } },
        { shipId: 'bob:1', sector: null },
      ],
    };
    fire('player.sector', update);

    const byId = new Map(result.current.players.map((p) => [p.shipId, p]));
    expect(byId.get('alice:1')?.sector).toEqual({ x: 6, y: 3 });
    expect(byId.get('bob:1')?.sector).toBeNull();
  });

  it('ship.renamed updates the name in place', () => {
    // Mutation: reading oldName instead of newName — the roster and the
    // target list disagree with what the player sees in combat messages.
    const { result } = renderHook(() => useHarness());
    fire('player.snapshot', { players: [ALICE] });

    const renamed: ShipRenamedPayload = {
      shipId: 'alice:1',
      oldName: 'Defiant',
      newName: 'Valiant',
    };
    fire('ship.renamed', renamed);

    expect(result.current.players[0].name).toBe('Valiant');
  });
});

describe('useSocket — teardown', () => {
  it('unmount removes every listener it registered', () => {
    // Mutation: dropping any socket.off in either cleanup, or passing a
    // different function reference to off(). Socket.io listeners live on the
    // module singleton, so a leak survives the component: after a remount
    // every event fires twice, and setState on the unmounted hook is the
    // classic React leak. This is the one case with no observable hook state
    // to assert — the registry is the observable.
    const { unmount } = renderHook(() => useHarness());

    const events = [
      'connect',
      'disconnect',
      'reconnect_attempt',
      'connect_error',
      'error',
      'prompt:ship-name',
      'prompt:ship-select',
      'command:result',
      'player.snapshot',
      'player.joined',
      'player.left',
      'physics.sector-transition',
      'player.sector',
      'ship.renamed',
    ];
    for (const event of events) expect(listenerCount(event)).toBe(1);

    unmount();

    for (const event of events) expect(listenerCount(event)).toBe(0);
  });
});
