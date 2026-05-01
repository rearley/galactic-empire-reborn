import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the socket client BEFORE importing App
vi.mock('../src/socket/socketClient', () => ({
  socket: {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
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
