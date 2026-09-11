/**
 * Terminal event handlers — the wiring between the socket and what the pilot
 * sees.
 *
 * Every case here is about a listener that either exists or does not. The class
 * of defect is already on the record twice in this file's own comments: the AI
 * taunt handler was added because "the server has emitted these since the AI
 * landed and nothing has ever listened", and `event.log`/`message.send` were
 * dropped on the floor for the same reason. A handler that is never registered,
 * registered on the wrong event name, or that returns early on the wrong side
 * of a comparison fails silently — the client still looks connected, the log
 * simply stops saying anything.
 *
 * Tested through the rendered <App/> rather than by calling the handlers
 * directly, because the registration IS the thing that keeps breaking.
 *
 * Does not duplicate:
 *   test/App.spec.tsx                          — region smoke tests, fleet-menu render
 *   test/server-notices.spec.tsx               — event.log / message.send / ship-destroyed
 *   test/own-hit-not-narrated-third-person.spec.tsx — combat.hit and phaser-fired
 *   test/ShipSelectPrompt.spec.tsx             — the prompt component's own keyboard rules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock('../src/auth/logout', () => ({ logout: vi.fn() }));

/**
 * Captures EVERY socket.on(...) registration, keyed by event name.
 *
 * A list per event, not a single handler: App and ScanPanel's `useScanRender`
 * both subscribe to `scan:render`, so a one-slot map would silently drop
 * whichever registered first and make this file test the wrong component.
 */
const handlers = new Map<string, ((payload: unknown) => void)[]>();

vi.mock('../src/socket/socketClient', () => ({
  socket: {
    connected: true,
    on: vi.fn((event: string, fn: (payload: unknown) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
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
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

import { App } from '../src/App';
import { useSocket, type UseSocketReturn } from '../src/socket/useSocket';
import { logout } from '../src/auth/logout';
import type { OnboardingPrompt } from '../src/socket/useSocket';

const LOCAL_SHIP = 'usr_me:1';

function useSocketReturning(overrides: Partial<UseSocketReturn> = {}): UseSocketReturn {
  const value: UseSocketReturn = {
    status: 'connected',
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
    ...overrides,
  };
  vi.mocked(useSocket).mockReturnValue(value);
  return value;
}

/** Fires a server event at every listener registered for it. */
function fire(event: string, payload: unknown): void {
  const list = handlers.get(event);
  expect(list, `no client listener for '${event}'`).toBeDefined();
  act(() => {
    for (const fn of list ?? []) fn(payload);
  });
}

function logText(): string {
  return screen.getByTestId('event-log').textContent ?? '';
}

function logLineCount(): number {
  return screen.getByTestId('event-log').querySelectorAll('div').length;
}

beforeEach(() => {
  handlers.clear();
  vi.mocked(logout).mockClear();
  useSocketReturning();
});

afterEach(() => {
  cleanup();
});

/**
 * The F KEY MAP panel is populated by a `fkeys.snapshot` pushed on board and
 * again after every `fset`. Without the listener the panel shows its
 * placeholder for the whole session, which is indistinguishable from "you have
 * no bindings" — so a pilot who has bound keys is told they have not.
 */
describe('fkeys.snapshot → F KEY MAP panel', () => {
  it('renders the bindings the server pushed', () => {
    render(<App />);
    fire('fkeys.snapshot', { fkeys: ['pha 100 1', '', 'sca se'] });

    expect(screen.getByTestId('fkey-row-f1').textContent).toContain('pha 100 1');
    expect(screen.getByTestId('fkey-row-f3').textContent).toContain('sca se');
    expect(screen.queryByTestId('fkey-row-f2')).toBeNull();
  });
});

/**
 * The sector map is the thing a pilot glances at while typing. It updates only
 * from `scan:render`, and it carries the scan's KIND because only `sca se` is
 * invalidated by leaving the sector — App is the only place that knows which
 * kind drew the cells, so if it stops passing `kind` through, either the map
 * blanks on every sector crossing (kind wrongly 'se') or it keeps showing the
 * sector you have left (kind wrongly anything else).
 */
describe('scan:render → sector map', () => {
  it('paints the cells the scan produced', () => {
    render(<App />);
    fire('scan:render', {
      kind: 'ra',
      mode: 'append',
      header: 'RANGE SCAN',
      cells: [{ x: 4, y: 2, type: 'ship', char: 'A' }],
    });

    expect(screen.getByTestId('cell-ship-4-2').textContent).toBe('A');
  });

  it('passes the SECTOR kind through, so crossing a boundary blanks the map', () => {
    useSocketReturning({ localShipId: LOCAL_SHIP });
    render(<App />);
    fire('scan:render', {
      kind: 'se',
      mode: 'append',
      header: 'SECTOR SCAN',
      cells: [{ x: 4, y: 2, type: 'ship', char: 'A' }],
    });
    expect(screen.getByTestId('cell-ship-4-2')).toBeDefined();

    fire('physics.sector-transition', {
      shipId: LOCAL_SHIP,
      fromSector: { x: 0, y: 0 },
      toSector: { x: 1, y: 0 },
      x: 1000,
      y: 0,
    });

    expect(screen.queryByTestId('cell-ship-4-2')).toBeNull();
  });

  it('keeps a RANGE scan across a boundary — it is not sector-scoped', () => {
    useSocketReturning({ localShipId: LOCAL_SHIP });
    render(<App />);
    fire('scan:render', {
      kind: 'ra',
      mode: 'append',
      header: 'RANGE SCAN',
      cells: [{ x: 4, y: 2, type: 'ship', char: 'A' }],
    });

    fire('physics.sector-transition', {
      shipId: LOCAL_SHIP,
      fromSector: { x: 0, y: 0 },
      toSector: { x: 1, y: 0 },
      x: 1000,
      y: 0,
    });

    expect(screen.getByTestId('cell-ship-4-2')).toBeDefined();
  });
});

/**
 * Canon broadcasts sector entry and exit to everyone already in the sector
 * (GEFUNCS.C:717-722). It is the only warning a stationary ship gets that
 * something has arrived, and the only confirmation that a ship you were
 * fighting has run.
 */
describe('sector:ship-entered / sector:ship-left', () => {
  it('announces an arrival', () => {
    render(<App />);
    fire('sector:ship-entered', { shipName: 'Ranger' });
    expect(screen.getByTestId('log-line-nav').textContent).toBe('Ranger has entered the sector.');
  });

  it('announces a departure', () => {
    render(<App />);
    fire('sector:ship-left', { shipName: 'Ranger' });
    expect(screen.getByTestId('log-line-nav').textContent).toBe('Ranger has left the sector.');
  });

  it('keeps the two apart when both arrive', () => {
    render(<App />);
    fire('sector:ship-entered', { shipName: 'Ranger' });
    fire('sector:ship-left', { shipName: 'Shadow' });
    const text = logText();
    expect(text).toContain('Ranger has entered the sector.');
    expect(text).toContain('Shadow has left the sector.');
  });
});

/**
 * The taunt is not flavour. Scan ranges are asymmetric — an Obliterator sees
 * several sectors and a starter Interceptor a fraction of one — so the AI
 * hunting you is routinely outside your own scanners, and canon's hail is the
 * only warning before it opens fire.
 * @see GECYBS.C:382-410 cyb_annoy, GEDROIDS.C:232-245 droid_annoy
 */
describe('AI hails', () => {
  it('renders a Cybertron taunt', () => {
    render(<App />);
    fire('cybertron.taunt', { message: '***\nHailing message from The Cybertron\n< Prepare to die >' });
    expect(logText()).toContain('Prepare to die');
  });

  it('renders a droid complaint — the SAME handler must be on both events', () => {
    render(<App />);
    fire('droid.annoy', { message: 'Why are you shooting at me?' });
    expect(logText()).toContain('Why are you shooting at me?');
  });

  it('files the hail as combat, not chatter', () => {
    render(<App />);
    fire('cybertron.taunt', { message: 'Prepare to die' });
    expect(screen.getByTestId('log-line-combat')).toBeDefined();
  });

  it('drops a hail with no message rather than printing a blank line', () => {
    render(<App />);
    expect(logLineCount()).toBe(0);
    fire('cybertron.taunt', {});
    expect(logLineCount()).toBe(0);
  });
});

/**
 * A decoy intercept is the payoff for having bought decoys, and canon tells the
 * DEFENDER: the `ltorps` walked in checktm are the weapons locked ONTO you and
 * `decout` is your own screen, so TORDEST/MISDEST go `outprfge(FILTER, usrn)`
 * to the ship that was saved — not to the shooter, not to bystanders.
 * @see GEFUNCS.C:1581-1594, GE/REL/MBMGEMSG.MSG TORDEST / MISDEST
 */
describe('combat.decoy-intercept', () => {
  it('tells the ship that was saved', () => {
    useSocketReturning({ localShipId: LOCAL_SHIP });
    render(<App />);
    fire('combat.decoy-intercept', { defenderId: LOCAL_SHIP, weapon: 'torpedo' });
    expect(logText()).toContain('The torpedo locked on to the decoy Sir!');
  });

  it('names the weapon that was eaten', () => {
    useSocketReturning({ localShipId: LOCAL_SHIP });
    render(<App />);
    fire('combat.decoy-intercept', { defenderId: LOCAL_SHIP, weapon: 'missile' });
    const text = logText();
    expect(text).toContain('The missile locked on to the decoy Sir!');
    expect(text).not.toContain('torpedo');
  });

  it('says nothing when someone ELSE\'s decoy did the work', () => {
    useSocketReturning({ localShipId: LOCAL_SHIP });
    render(<App />);
    fire('combat.decoy-intercept', { defenderId: 'usr_other:2', weapon: 'torpedo' });
    expect(logLineCount()).toBe(0);
  });
});

/**
 * The command path. `send` is handed straight to CommandInput; anything that
 * mangles or swallows the string costs the pilot the command they typed, which
 * during a fight is a ship.
 */
describe('command submit', () => {
  it('sends the typed line to the socket verbatim', () => {
    const { send } = useSocketReturning();
    render(<App />);
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'pha 100 1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('pha 100 1');
  });
});

/**
 * Onboarding replies. The gateway boards NOTHING until it receives
 * `prompt:reply`, so a reply that never leaves — or leaves with the wrong value
 * — parks the account in a session with no active ship and "No active ship." as
 * the answer to every command.
 */
describe('onboarding prompt replies', () => {
  const shipName: OnboardingPrompt = {
    type: 'ship-name',
    payload: { step: 'NAME', rule: '1-19 printable ASCII' },
  };

  it('sends the chosen ship name', () => {
    const { emitPromptReply } = useSocketReturning({ onboardingPrompt: shipName });
    render(<App />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Phoenix' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(emitPromptReply).toHaveBeenCalledWith('Phoenix');
  });

  it('surfaces the gateway\'s name-taken error on the prompt', () => {
    useSocketReturning({
      onboardingPrompt: {
        type: 'ship-name',
        payload: { step: 'NAME', rule: '1-19 printable ASCII', error: 'name-taken' },
      },
    });
    render(<App />);
    expect(screen.getByRole('alert').textContent).toContain('already taken');
  });

  it('sends the fleet choice as a NUMBER, which is what prompt:reply expects', () => {
    const { emitPromptReply } = useSocketReturning({
      onboardingPrompt: {
        type: 'ship-select',
        payload: {
          step: 'SHIP_SELECT',
          ships: [
            { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Phoenix', sector: { x: 0, y: 0 } },
            { index: 2, shipno: 2, className: 'Stealth Fighter', shipname: 'Shadow', sector: { x: 3, y: -4 } },
          ],
        },
      },
    });
    render(<App />);
    const input = screen.getByTestId('ship-select-input');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(emitPromptReply).toHaveBeenCalledWith(2);
  });

  /**
   * The fleet menu is modal: there is no command input behind it, so the logout
   * button is the ONLY way out of a session that is stuck there. It must be
   * wired, and it must be wired on this prompt.
   */
  it('offers a way out of the fleet menu', () => {
    useSocketReturning({
      onboardingPrompt: { type: 'ship-select', payload: { step: 'SHIP_SELECT', ships: [] } },
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(vi.mocked(logout)).toHaveBeenCalled();
  });
});
