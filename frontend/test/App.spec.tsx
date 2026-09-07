import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// App no longer reads the token itself (RequireAuth gates /play on it before
// App ever mounts) — this mock just keeps clearToken() a no-op for the
// socket-auth-failure path exercised elsewhere.
vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// Mock the socket client BEFORE importing App
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  connectSocket: vi.fn(),
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onSocketAuthFailed: vi.fn(),
}));

// Mock useSocket to return a controlled status
vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'disconnected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

describe('App smoke test', () => {
  it('renders without console errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App />);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('renders EventLog region', () => {
    render(<App />);
    expect(screen.getByTestId('event-log')).toBeDefined();
  });

  it('renders ScanMap region', () => {
    render(<App />);
    expect(screen.getByTestId('scan-map')).toBeDefined();
  });

  it('renders CommandInput region', () => {
    render(<App />);
    expect(screen.getByTestId('command-input')).toBeDefined();
  });

  it('renders ConnectionIndicator', () => {
    render(<App />);
    expect(screen.getByTestId('status-label')).toBeDefined();
  });
});

// Import AFTER mocks
import { App } from '../src/App';

/**
 * Regression: the gateway emits `prompt:ship-select` for a multi-ship captain
 * and boards nothing until it replies, but App rendered the ordinary command
 * input regardless — so buying a second ship left the account staring at an
 * empty log with "No active ship." as the answer to everything.
 */
describe('App — multi-ship fleet menu', () => {
  it('renders the fleet menu instead of the command input', async () => {
    const { useSocket } = await import('../src/socket/useSocket');
    vi.mocked(useSocket).mockReturnValue({
      status: 'connected' as const,
      // `lastResult` is gone: results are delivered through a callback sink so
      // a burst cannot overwrite an undelivered one.
      // @see src/socket/useCommandResultQueue.ts
      send: vi.fn(),
      localShipId: null,
      onboardingPrompt: {
        type: 'ship-select' as const,
        payload: {
          ships: [
            { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Phoenix', sector: { x: 0, y: 0 } },
            { index: 2, shipno: 2, className: 'Stealth Fighter', shipname: 'Shadow', sector: { x: 3, y: -4 } },
          ],
        },
      },
      reconnect: vi.fn(),
      emitPromptReply: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('ship-select')).toBeDefined();
    expect(screen.queryByTestId('command-input')).toBeNull();
  });
});
