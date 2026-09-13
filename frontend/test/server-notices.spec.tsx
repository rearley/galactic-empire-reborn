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

  /**
   * Being scanned is a tactical signal, and the client was deaf to it.
   *
   * The backend has emitted canon's SCAN1/2/3 on `command.notice` to the
   * scanned ship's own room since scan modes landed, and `frontend/src` had
   * zero listeners for that event — so a player never learned someone was
   * sizing them up before closing. Scan ranges are asymmetric (an Obliterator
   * sees six sectors, a starter Interceptor one and a half), which is what
   * makes the notice the only warning the game gives.
   *
   * The payload is `{ lines: EventLogLine[] }`, not the single `{ text }` shape
   * `event.log` uses — it is a different contract and needs its own handler.
   * @see issue #2  @see GE/REL/MBMGEMSG.MSG SCAN1
   */
  it('renders a command.notice — being scanned reaches the log', () => {
    render(<App />);
    fire('command.notice', {
      lines: [{ text: 'Sir! We are being scanned by Ship A, The Ranger.', category: 'combat' }],
    });
    expect(screen.getByTestId('event-log').textContent).toContain('We are being scanned');
  });

  it('renders every line of a multi-line notice', () => {
    render(<App />);
    fire('command.notice', {
      lines: [
        { text: 'first notice', category: 'combat' },
        { text: 'second notice', category: 'system' },
      ],
    });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).toContain('first notice');
    expect(text).toContain('second notice');
  });

  it('ignores a malformed notice rather than rendering "undefined"', () => {
    render(<App />);
    expect(() => fire('command.notice', { lines: [{ category: 'combat' }] })).not.toThrow();
    expect(screen.getByTestId('event-log').textContent).not.toContain('undefined');
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

  /**
   * The client no longer narrates a kill: the SERVER sends canon's KILLEDBY
   * ("Commander X's ship was destroyed by Y!!!") as an ordinary event.log line,
   * so a client line on top of it was a second line about one death.
   * @see backend test/gateway/killedby-broadcast.spec.ts
   */
  it('stays silent on an ordinary ship kill — the server sent KILLEDBY', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'usr_raider:2',
      victimUserid: 'usr_raider',
      attackerId: 'usr_hunter:1',
      weapon: 'phaser',
      attackerName: null,
    });
    expect(screen.getByTestId('event-log').textContent ?? '').not.toContain('destroyed');
  });

  /**
   * Not every death has a killer. A gravity crash sets damage to 101 with no
   * attacker (GEFUNCS.C:887) and a self-destruct has none by definition. The
   * client used to announce "destroyed by unknown", inventing an assailant, and
   * was then changed to compose a bare line naming the victim by USERID — which
   * for an automaton printed the internal `Cybrg-NNN` account that canon's
   * username() exists to hide. Reported from play: "Cybrg-222 has been
   * destroyed!".
   *
   * Canon covers this case itself with DIED (GEFUNCS.C:1263), sent galaxy-wide
   * by the server, so the client says nothing at all and has no fallback left
   * to leak a name through.
   */
  it('stays silent on a killer-less death — the server sent DIED', () => {
    render(<App />);
    fire('combat.ship-destroyed', {
      victimId: 'Cybrg-222:1',
      victimUserid: 'Cybrg-222',
      attackerId: null,
      weapon: null,
      attackerName: null,
    });
    const text = screen.getByTestId('event-log').textContent ?? '';
    expect(text).not.toContain('unknown');
    expect(text).not.toContain('Cybrg-222');
  });
});
