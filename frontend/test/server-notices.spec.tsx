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

  /**
   * A colony that successfully defends itself is the payoff for garrisoning
   * one, and everyone watching was told "destroyed by unknown". `fireion` sets
   * the victim's `lastfired` to -1 so no attacking ship resolves
   * (GEFUNCS.C:1796), which left an ion kill with no attacker and no weapon —
   * exactly the shape a self-destruct produces — so the client's
   * `attackerId ? ... : 'unknown'` fallback swallowed it.
   */
  it('names the planet when a colony\'s ion cannons make the kill', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'usr_raider:2',
      victimUserid: 'usr_raider',
      attackerId: null,
      weapon: 'ion',
      attackerName: 'Aurelia-Landing',
    });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).toContain('Aurelia-Landing');
    expect(text).not.toContain('unknown');
  });

  it('still credits planetary defences when the planet cannot be named', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'usr_raider:2',
      victimUserid: 'usr_raider',
      attackerId: null,
      weapon: 'ion',
      attackerName: null,
    });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).toContain('planetary defences');
    expect(text).not.toContain('unknown');
  });

  it('leaves an ordinary ship kill alone', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'usr_raider:2',
      victimUserid: 'usr_raider',
      attackerId: 'usr_hunter:1',
      weapon: 'phaser',
      attackerName: null,
    });
    expect(screen.getByTestId('event-log').textContent).toContain('destroyed by');
  });

  /**
   * Not every death has a killer. A gravity crash sets damage to 101 with no
   * attacker (GEFUNCS.C:887) and a self-destruct has none by definition, so
   * both arrived with attackerId null and weapon null — and the client
   * announced "destroyed by unknown", inventing an assailant for a pilot who
   * simply flew into a planet.
   */
  it('does not invent a killer for a death that had none', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'usr_clumsy:1',
      victimUserid: 'usr_clumsy',
      attackerId: null,
      weapon: null,
      attackerName: null,
    });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).not.toContain('unknown');
    expect(text).toContain('destroyed');
  });
});
