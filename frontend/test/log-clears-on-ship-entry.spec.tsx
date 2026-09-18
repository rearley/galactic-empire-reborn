import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { OnboardingPrompt } from '../src/socket/useSocket';

/**
 * Every boarding prints WELCOM. `tossingegame` prints it at
 * GEFUNCS.C:172 `prfmsg(WELCOM,waruptr->userid);`, and that function runs each time a
 * pilot is tossed into the arena — canon greets you on every boarding, so the
 * server is right to send it.
 *
 * What was ours is the log pane underneath. In canon `x` dropped you to the
 * main menu, which redrew the screen, so the next welcome never landed
 * directly under the last one. Ours kept a single scrollback across every
 * hull change, so `x` / select / `x` / select stacked identical welcomes:
 *
 *   Welcome aboard Commander rick, the con is yours. Type ? if you need assistance.
 *   Welcome aboard Commander rick, the con is yours. Type ? if you need assistance.
 *   Welcome aboard Commander rick, the con is yours. Type ? if you need assistance.
 *
 * Reported from play. The log is cleared when ship entry BEGINS, which is the
 * same rule scan data already follows — a new hull starts blind, and the scan
 * reset has its own spec for the same reason.
 *
 * Clearing on the way IN rather than on the way out is load-bearing. The
 * prompt is cleared by `player.snapshot`, and boarding emits the WELCOM
 * `command:result` BEFORE that snapshot — so clearing when the prompt goes
 * away would wipe the very welcome the player just arrived for and leave an
 * empty log.
 */

vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const handlers = new Map<string, (payload: unknown) => void>();

vi.mock('../src/socket/socketClient', () => ({
  socket: {
    connected: true,
    on: vi.fn((event: string, fn: (payload: unknown) => void) => { handlers.set(event, fn); }),
    off: vi.fn(),
    emit: vi.fn(),
  },
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

import { App } from '../src/App';

const FLEET: OnboardingPrompt = {
  type: 'ship-select',
  payload: {
    step: 'SHIP_SELECT',
    ships: [
      { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Orbiter', sector: { x: 0, y: 0 } },
    ],
  },
};

function fire(event: string, payload: unknown): void {
  const handler = handlers.get(event);
  expect(handler, `no client listener for '${event}'`).toBeDefined();
  act(() => handler!(payload));
}

const welcome = () =>
  fire('event.log', {
    category: 'system',
    text: 'Welcome aboard Commander rick, the con is yours. Type ? if you need assistance.',
  });

const logText = () => screen.getByTestId('event-log').textContent ?? '';
const countWelcomes = () => logText().split('Welcome aboard').length - 1;

describe('the event log starts clean on ship entry', () => {
  beforeEach(() => {
    handlers.clear();
    socketState.onboardingPrompt = null;
  });

  it('drops the previous hull\'s log when ship entry begins', () => {
    const { rerender } = render(<App />);
    welcome();
    fire('event.log', { category: 'combat', text: 'The Orbiter fires a phasor volley!' });
    expect(countWelcomes()).toBe(1);

    // `x` — the fleet menu arrives.
    socketState.onboardingPrompt = FLEET;
    rerender(<App />);
    // Boarding again: the welcome lands on a clean log.
    socketState.onboardingPrompt = null;
    rerender(<App />);
    welcome();

    expect(countWelcomes()).toBe(1);
    expect(logText()).not.toContain('phasor volley');
  });

  it('still shows the welcome after boarding — the clear cannot outrun it', () => {
    const { rerender } = render(<App />);
    socketState.onboardingPrompt = FLEET;
    rerender(<App />);
    socketState.onboardingPrompt = null;
    rerender(<App />);
    welcome();

    expect(logText()).toContain('Welcome aboard Commander rick');
  });

  it('leaves the log alone while a captain is simply flying', () => {
    render(<App />);
    welcome();
    fire('event.log', { category: 'nav', text: 'Entering sector (3, 4).' });

    expect(countWelcomes()).toBe(1);
    expect(logText()).toContain('Entering sector');
  });
});
