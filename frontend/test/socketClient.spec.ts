import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock tokenStore so socketClient can import it without localStorage
vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// Mock socket.io-client BEFORE importing the module under test
vi.mock('socket.io-client', () => {
  const mockSocket = {
    connected: false,
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    // `reconnect_attempt` is a Manager event, exposed on the real client as
    // `socket.io` — see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md.
    io: {
      on: vi.fn(),
      off: vi.fn(),
    },
  };
  return {
    io: vi.fn(() => mockSocket),
    Socket: class {},
  };
});

describe('socketClient', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { io } = await import('socket.io-client');
    const ms = vi.mocked(io)();
    ms.emit = vi.fn();
    ms.on = vi.fn();
    ms.off = vi.fn();
    ms.io.on = vi.fn();
    ms.io.off = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('socket is constructed with auth callback for JWT (not legacy userid query)', async () => {
    await import('../src/socket/socketClient');
    const { io } = await import('socket.io-client');
    // Find the call that has config args (beforeEach also calls io() with no args)
    const allCalls = (io as ReturnType<typeof vi.fn>).mock.calls;
    const configCall = allCalls.find((c) => c.length > 0);
    const callArgs = configCall?.[0] as Record<string, unknown> | undefined;
    // auth must be a function (dynamic callback that reads tokenStore at connect time)
    expect(typeof callArgs?.auth).toBe('function');
    // legacy query.userid must not be present
    expect(callArgs?.query).toBeUndefined();
  });

  it('sendCommand emits "command" event with the input', async () => {
    const { sendCommand } = await import('../src/socket/socketClient');
    const { socket } = await import('../src/socket/socketClient');
    (socket.emit as ReturnType<typeof vi.fn>).mockClear();
    sendCommand('rot 45');
    expect(socket.emit).toHaveBeenCalledWith('command', { input: 'rot 45' });
  });

  it('onCommandResult registers a listener for "command:result"', async () => {
    const { onCommandResult } = await import('../src/socket/socketClient');
    const { socket } = await import('../src/socket/socketClient');
    const listener = vi.fn();
    onCommandResult(listener);
    expect(socket.on).toHaveBeenCalledWith('command:result', listener);
  });

  it('onCommandResult returns an unsubscribe function', async () => {
    const { onCommandResult } = await import('../src/socket/socketClient');
    const { socket } = await import('../src/socket/socketClient');
    const listener = vi.fn();
    const unsub = onCommandResult(listener);
    unsub();
    expect(socket.off).toHaveBeenCalledWith('command:result', listener);
  });

  it('socket is constructed with reconnectionDelayMax 30000 and randomizationFactor 0.5 (FR-020)', async () => {
    await import('../src/socket/socketClient');
    const { io } = await import('socket.io-client');
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
      }),
    );
  });
});

/**
 * Tests that useSocket maps socket.io lifecycle events to ConnectionStatus values (FR-019, FR-021).
 * @see specs/010-react-frontend/data-model.md §B.5
 */
describe('ConnectionStatus event mapping (FR-019, FR-021)', () => {
  it('connect event → connected status', async () => {
    const { socket } = await import('../src/socket/socketClient');
    const registeredEvents: string[] = [];
    (socket.on as ReturnType<typeof vi.fn>).mockImplementation((ev: string) => {
      registeredEvents.push(ev);
    });

    const { renderHook } = await import('@testing-library/react');
    const { useSocket } = await import('../src/socket/useSocket');
    renderHook(() => useSocket());

    expect(registeredEvents).toContain('connect');
  });

  it('disconnect event → disconnected status', async () => {
    const { socket } = await import('../src/socket/socketClient');
    const registeredEvents: string[] = [];
    (socket.on as ReturnType<typeof vi.fn>).mockImplementation((ev: string) => {
      registeredEvents.push(ev);
    });

    const { renderHook } = await import('@testing-library/react');
    const { useSocket } = await import('../src/socket/useSocket');
    renderHook(() => useSocket());

    expect(registeredEvents).toContain('disconnect');
  });

  it('reconnect_attempt event → reconnecting status', async () => {
    const { socket } = await import('../src/socket/socketClient');
    // `reconnect_attempt` is a Manager event, not a Socket event — it is
    // registered on `socket.io` (the Manager), not `socket` itself.
    // @see src/socket/useSocket.ts
    const registeredEvents: string[] = [];
    (socket.io.on as ReturnType<typeof vi.fn>).mockImplementation((ev: string) => {
      registeredEvents.push(ev);
    });

    const { renderHook } = await import('@testing-library/react');
    const { useSocket } = await import('../src/socket/useSocket');
    renderHook(() => useSocket());

    expect(registeredEvents).toContain('reconnect_attempt');
  });

  it('connect_error event → disconnected status', async () => {
    const { socket } = await import('../src/socket/socketClient');
    const registeredEvents: string[] = [];
    (socket.on as ReturnType<typeof vi.fn>).mockImplementation((ev: string) => {
      registeredEvents.push(ev);
    });

    const { renderHook } = await import('@testing-library/react');
    const { useSocket } = await import('../src/socket/useSocket');
    renderHook(() => useSocket());

    expect(registeredEvents).toContain('connect_error');
  });
});
