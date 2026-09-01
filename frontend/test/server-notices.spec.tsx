import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

/** Captures every socket.on(...) handler so tests can fire server events. */
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

vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'connected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

import { App } from '../src/App';

/**
 * A whole family of server notices funnels through the `event.log` socket event
 * — the self-destruct countdown and its detonation, cloak collapse from energy
 * starvation, subsystem damage warnings, the call-for-help alert when someone
 * attacks your planet, and the sector notice when a captain abandons ship.
 * Radio traffic arrives on `message.send`.
 *
 * Nothing on the client listened for either, so all of it was dropped on the
 * floor: `des` started a countdown the pilot could not see, and `sen`/`fre`
 * transmitted into a void no player could hear.
 */
function fire(event: string, payload: unknown): void {
  const handler = handlers.get(event);
  expect(handler, `no client listener for '${event}'`).toBeDefined();
  act(() => handler!(payload));
}

describe('server notices reach the event log', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('renders an event.log notice', () => {
    render(<App />);
    fire('event.log', { category: 'system', text: 'Self-destruct in 4 ticks!' });
    expect(screen.getByTestId('event-log').textContent).toContain('Self-destruct in 4 ticks!');
  });

  it('keeps the notice category so combat lines stay styled as combat', () => {
    render(<App />);
    fire('event.log', { category: 'combat', text: 'Reactor breach!' });
    const line = screen.getByText('Reactor breach!');
    expect(line.className).toBe(screen.getByTestId('event-log').querySelector('div')?.className);
  });

  it('falls back to a sane category when the server omits one', () => {
    render(<App />);
    expect(() => fire('event.log', { text: 'no category here' })).not.toThrow();
    expect(screen.getByTestId('event-log').textContent).toContain('no category here');
  });

  it('renders a radio transmission with its sender and channel', () => {
    render(<App />);
    fire('message.send', { from: 'Ranger', channel: 'A', text: 'anyone out there?' });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).toContain('Ranger');
    expect(text).toContain('[A]');
    expect(text).toContain('anyone out there?');
  });

  it('ignores a malformed transmission rather than rendering "undefined"', () => {
    render(<App />);
    fire('message.send', { text: 'orphan' });
    expect(screen.getByTestId('event-log').textContent).not.toContain('undefined');
  });
});
