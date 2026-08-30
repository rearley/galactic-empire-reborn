// @vitest-environment jsdom

/**
 * T049 — Returning player skips AuthScreen (TDD).
 *
 * When a JWT token is already in localStorage, App must NOT render AuthScreen
 * but instead render the terminal UI directly.
 *
 * @see specs/011-onboarding/plan.md §US2 returning-player path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock tokenStore so getToken() returns a pre-existing token.
vi.mock('../../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'existing-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// Mock socketClient to provide a no-op socket and connectSocket.
vi.mock('../../src/socket/socketClient', () => ({
  socket: {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  connectSocket: vi.fn(),
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onSocketAuthFailed: vi.fn(),
}));

// Mock useSocket so the Terminal component renders without a live socket.
vi.mock('../../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'connecting',
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    emitPromptReply: vi.fn(),
  })),
}));

import { App } from '../../src/App';

describe('App — returning player (T049)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT render AuthScreen (no username/password fields) when token exists', () => {
    render(<App />);
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('renders the terminal UI (event-log) when token exists', () => {
    render(<App />);
    expect(screen.getByTestId('event-log')).toBeDefined();
  });
});
