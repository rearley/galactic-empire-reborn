import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Provide a stored token so App skips AuthScreen and renders the terminal
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
}));

// Mock useSocket to return a controlled status
vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'disconnected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
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
