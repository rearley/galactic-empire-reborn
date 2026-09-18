import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OnboardingPrompt } from '../src/socket/useSocket';

/**
 * Ship select was not a screen. It swapped the bottom input bar and left the
 * whole terminal mounted behind it — event log, scan map, scan readout and the
 * player roster — so a captain who had typed `x` sat watching a game they were
 * no longer in. v0.21.2 stopped the server feeding that socket; this stops the
 * client from showing a world to someone who is not in one.
 *
 * Both pre-flight prompts get the same treatment. `prompt:ship-name` is the
 * other one: a brand-new pilot named their first ship over an empty terminal,
 * which is the same mistake with nothing in it yet to notice.
 *
 * What stays is the session, not the game: the title bar carries the build
 * identity, and the connection banner has to be able to tell you the socket
 * dropped while you were choosing.
 */

vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock('../src/socket/socketClient', () => ({
  socket: { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  connectSocket: vi.fn(),
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onSocketAuthFailed: vi.fn(),
}));

const socketState: { onboardingPrompt: OnboardingPrompt | null } = { onboardingPrompt: null };

vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'connected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: socketState.onboardingPrompt,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

const FLEET = {
  step: 'SHIP_SELECT' as const,
  ships: [
    { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Kestrel', sector: { x: 5, y: 3 } },
    { index: 2, shipno: 2, className: 'Freighter', shipname: 'Mule', sector: { x: 0, y: 0 } },
  ],
};

// `scan-panel-empty` rather than `scan-panel`: the readout renders its empty
// state until a scan arrives, and the empty state is exactly what a freshly
// boarded captain sees.
const GAME_CHROME = [
  'event-log',
  'scan-map',
  'scan-panel-empty',
  'player-list-panel',
  'command-input',
];

describe('pre-flight screen', () => {
  beforeEach(() => {
    socketState.onboardingPrompt = null;
  });

  it('shows the fleet menu and none of the game', () => {
    socketState.onboardingPrompt = { type: 'ship-select', payload: FLEET };
    render(<App />);

    expect(screen.getByTestId('ship-select')).toBeDefined();
    for (const id of GAME_CHROME) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('shows the name prompt and none of the game', () => {
    socketState.onboardingPrompt = {
      type: 'ship-name',
      payload: { step: 'NAME', rule: '1-19 printable ASCII' },
    };
    render(<App />);

    expect(screen.getByText(/Enter a name for your ship/)).toBeDefined();
    for (const id of GAME_CHROME) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('keeps the session facts: build identity and connection state', () => {
    socketState.onboardingPrompt = { type: 'ship-select', payload: FLEET };
    render(<App />);

    expect(screen.getByTestId('status-label')).toBeDefined();
    expect(screen.getByTitle('build')).toBeDefined();
  });

  it('renders the terminal again once a ship is boarded', () => {
    socketState.onboardingPrompt = null;
    render(<App />);

    for (const id of GAME_CHROME) expect(screen.getByTestId(id)).toBeDefined();
    expect(screen.queryByTestId('ship-select')).toBeNull();
  });
});

import { App } from '../src/App';
