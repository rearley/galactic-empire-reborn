import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock socket.io-client BEFORE importing the module under test
vi.mock('socket.io-client', () => {
  const mockSocket = {
    connected: false,
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    query: { userid: 'DEV' },
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
    const ms = (io as ReturnType<typeof vi.fn>)();
    ms.emit = vi.fn();
    ms.on = vi.fn();
    ms.off = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('socket is constructed with userid query param', async () => {
    await import('../src/socket/socketClient');
    const { io } = await import('socket.io-client');
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ userid: 'DEV' }),
      }),
    );
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
});
