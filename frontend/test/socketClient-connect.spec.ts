import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Connection construction and auth-failure routing in `src/socket/socketClient.ts`.
 *
 * Two failure modes are being pinned here, both of which look fine from the
 * outside:
 *
 *  1. The handshake sends the wrong token — or none. `auth` is a CALLBACK
 *     precisely so socket.io re-reads `tokenStore` on every (re)connect. If it
 *     were ever flattened to a plain object it would be evaluated once, at
 *     module load, when no player has logged in yet: every socket would then
 *     hand the server `{ token: null }` forever.
 *  2. A rejected credential does not log the player out. `AUTH_REQUIRED` must
 *     clear the token, stop the socket, and fire the registered callback so the
 *     app returns to the login screen. If any of those three is skipped the
 *     client keeps retrying a credential the server will never accept, while the
 *     UI still shows a session.
 *
 * `socket.io-client` is mocked, so nothing here opens a connection. The real
 * `tokenStore` is used deliberately — the point of case 1 is what the actual
 * collaborator returns, not what a stub returns.
 *
 * Complements `src/socket/__tests__/socket-error-handling.spec.ts` (which calls
 * `handleServerError` directly) by going through the wiring: the handler the
 * module itself registered on the socket.
 */

type AuthPayload = { token: string | null };
type AuthCallback = (cb: (payload: AuthPayload) => void) => void;

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  // No self-referential return values: socketClient never uses the value
  // returned by connect/disconnect/on/off, and a `() => socket` initialiser
  // would be a circular type reference under noImplicitAny.
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void): void => {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    }),
    off: vi.fn(),
  };
  const io = vi.fn((_opts?: Record<string, unknown>) => socket);
  return { handlers, socket, io };
});

vi.mock('socket.io-client', () => ({ io: mocks.io, Socket: class {} }));

/**
 * Fresh module registry per test: `socketClient` and `tokenStore` both hold
 * module-level state (the socket singleton, the auth-failed callback, the
 * in-memory token), and each case needs it clean.
 */
async function loadClient(): Promise<{
  client: typeof import('../src/socket/socketClient');
  tokenStore: typeof import('../src/auth/tokenStore');
  ioOptions: Record<string, unknown>;
}> {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.io.mockClear();
  mocks.socket.connect.mockClear();
  mocks.socket.disconnect.mockClear();
  mocks.socket.emit.mockClear();
  mocks.socket.on.mockClear();
  mocks.socket.off.mockClear();

  const client = await import('../src/socket/socketClient');
  const tokenStore = await import('../src/auth/tokenStore');

  const opts = mocks.io.mock.calls[0]?.[0];
  if (opts === undefined) throw new Error('io() was never called with options');
  return { client, tokenStore, ioOptions: opts };
}

/** Invoke the handler(s) the module registered on the socket for `event`. */
function fire(event: string, ...args: unknown[]): void {
  const list = mocks.handlers.get(event);
  if (list === undefined || list.length === 0) {
    throw new Error(`socketClient registered no handler for "${event}"`);
  }
  for (const fn of list) fn(...args);
}

beforeEach(() => {
  localStorage.clear();
});

describe('socketClient — handshake credential', () => {
  it('hands io() a token read at connect time, not at module load', async () => {
    const { tokenStore, ioOptions } = await loadClient();

    // The token arrives AFTER the socket was constructed — which is always the
    // case in production, since the module loads before the player logs in.
    tokenStore.setToken('jwt-issued-after-load');

    const auth = ioOptions.auth as AuthCallback;
    let payload: AuthPayload | undefined;
    auth((p) => {
      payload = p;
    });

    expect(payload).toEqual({ token: 'jwt-issued-after-load' });
  });

  it('re-reads the store on every handshake, so a re-login is picked up', async () => {
    const { tokenStore, ioOptions } = await loadClient();
    const auth = ioOptions.auth as AuthCallback;

    tokenStore.setToken('jwt-first');
    let first: AuthPayload | undefined;
    auth((p) => {
      first = p;
    });

    tokenStore.setToken('jwt-second');
    let second: AuthPayload | undefined;
    auth((p) => {
      second = p;
    });

    expect(first).toEqual({ token: 'jwt-first' });
    expect(second).toEqual({ token: 'jwt-second' });
  });

  it('does not open the connection at import time', async () => {
    const { ioOptions } = await loadClient();

    expect(ioOptions.autoConnect).toBe(false);
    expect(mocks.socket.connect).not.toHaveBeenCalled();
  });

  it('connectSocket() opens the connection', async () => {
    const { client } = await loadClient();

    client.connectSocket();

    expect(mocks.socket.connect).toHaveBeenCalledTimes(1);
    expect(mocks.socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('socketClient — rejected credential', () => {
  it('routes the socket’s own "error" event into handleServerError', async () => {
    const { client } = await loadClient();

    const registered: unknown[] = mocks.handlers.get('error') ?? [];
    expect(registered).toContain(client.handleServerError as unknown);
  });

  it('AUTH_REQUIRED, delivered through the wired handler, logs the player out', async () => {
    const { client, tokenStore } = await loadClient();
    tokenStore.setToken('jwt-rejected');
    const onFailed = vi.fn();
    client.onSocketAuthFailed(onFailed);

    fire('error', { code: 'AUTH_REQUIRED' });

    expect(tokenStore.getToken()).toBeNull();
    expect(mocks.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('SESSION_REPLACED does not send the player back to login', async () => {
    const { client, tokenStore } = await loadClient();
    tokenStore.setToken('jwt-still-good');
    const onFailed = vi.fn();
    client.onSocketAuthFailed(onFailed);

    fire('error', { code: 'SESSION_REPLACED' });

    expect(onFailed).not.toHaveBeenCalled();
    expect(tokenStore.getToken()).toBe('jwt-still-good');
    expect(mocks.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('an unrelated error code leaves the session alone', async () => {
    const { client, tokenStore } = await loadClient();
    tokenStore.setToken('jwt-still-good');
    const onFailed = vi.fn();
    client.onSocketAuthFailed(onFailed);

    fire('error', { code: 'NO_SHIP', message: 'you have no ship' });

    expect(onFailed).not.toHaveBeenCalled();
    expect(mocks.socket.disconnect).not.toHaveBeenCalled();
    expect(tokenStore.getToken()).toBe('jwt-still-good');
  });

  it('auth:logout clears the stale token, stops the socket and notifies the app', async () => {
    const { client, tokenStore } = await loadClient();
    tokenStore.setToken('jwt-for-deleted-user');
    const onFailed = vi.fn();
    client.onSocketAuthFailed(onFailed);

    fire('auth:logout');

    expect(tokenStore.getToken()).toBeNull();
    expect(mocks.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected credential when no auth-failed callback is registered', async () => {
    const { tokenStore } = await loadClient();
    tokenStore.setToken('jwt-rejected');

    // No onSocketAuthFailed() call: this is the state during the public landing
    // page, before <App/> mounts. The optional call must not throw, or the
    // socket.io listener chain dies and the token is never cleared.
    expect(() => fire('error', { code: 'AUTH_REQUIRED' })).not.toThrow();
    expect(tokenStore.getToken()).toBeNull();
  });
});

describe('socketClient — server error subscription', () => {
  it('onError subscribes the caller to the server "error" channel', async () => {
    const { client } = await loadClient();
    const listener = vi.fn();

    client.onError(listener);

    expect(mocks.socket.on).toHaveBeenCalledWith('error', listener);
  });

  it('onError’s unsubscribe removes that exact listener', async () => {
    const { client } = await loadClient();
    const listener = vi.fn();

    const unsubscribe = client.onError(listener);
    expect(mocks.socket.off).not.toHaveBeenCalled();
    unsubscribe();

    expect(mocks.socket.off).toHaveBeenCalledWith('error', listener);
  });

  it('a caller’s onError listener does not displace the module’s own handler', async () => {
    const { client, tokenStore } = await loadClient();
    tokenStore.setToken('jwt-rejected');
    client.onError(vi.fn());
    const onFailed = vi.fn();
    client.onSocketAuthFailed(onFailed);

    fire('error', { code: 'AUTH_REQUIRED' });

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(tokenStore.getToken()).toBeNull();
  });
});
