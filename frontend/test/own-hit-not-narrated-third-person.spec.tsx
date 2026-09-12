import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

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

const LOCAL = 'usr_me:1';

vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'connected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: 'usr_me:1',
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

import { App } from '../src/App';

/**
 * The client says NOTHING about weapons fire. The server says all of it.
 *
 * This file used to police a set of client-side combat lines, removing them one
 * by one as each turned out to duplicate canon's own text. The last one
 * standing was `Sensors confirm a <weapon> strike on <ship>.`, kept for
 * torpedoes and missiles on the belief that canon tells a firer nothing after
 * launch — the 2026-09-07 decision says so in as many words, and states that no
 * string for a firer-side impact exists in MBMGEMSG.MSG.
 *
 * Two strings do: MTACC1 and MTACC2, and `acctm` prints one of them to the
 * firer's own channel on every torpedo or missile hit —
 * GEFUNCS.C:1738-1743 `	prfmsg(MTACC1+mt,shpltr(channel,usrn),ptr->shipname);`
 * followed by `outprfge(ALWAYS,channel)`. The port wired that relay later
 * without revisiting the decision it disproved, so a pilot got both tellings at
 * once, which is the log in issue #8.
 *
 * Canon's words win. Both socket subscriptions are gone, so what remains is:
 * the server relays PHITHIM/PDEFLECT to a phaser's firer, MTACC1/MTACC2 to a
 * torpedo or missile firer, PHITYOU/PHITDEF/THIT/MHIT/MINE4 to the victim, and
 * nothing to anyone else — a bystander is shown no part of someone else's
 * fight, and a mine's layer is told nothing at all.
 *
 * @see docs/DECISIONS.md 2026-09-07, corrected 2026-09-12
 */
function fire(event: string, payload: unknown): void {
  const handler = handlers.get(event);
  act(() => handler?.(payload));
}

/** Whether the client registered a listener for an event at all. */
const listening = (event: string): boolean => handlers.has(event);

const hit = (over: Record<string, unknown> = {}) => ({
  attackerId: LOCAL,
  attackerName: 'QuiteCat',
  victimId: 'Cybrg-208:1',
  victimName: 'Cybertron 43319',
  weapon: 'phaser',
  damageHull: 24,
  damageShield: 0,
  ...over,
});

describe('the client narrates no weapons fire of its own', () => {
  beforeEach(() => {
    handlers.clear();
    render(<App />);
  });

  it('subscribes to neither combat.hit nor combat.phaser-fired', () => {
    expect(listening('combat.hit')).toBe(false);
    expect(listening('combat.phaser-fired')).toBe(false);
  });

  it('still subscribes to the events it does render', () => {
    // The guard against deleting too much: deaths and decoy saves are client
    // narration by design, and event.log carries the server's canon text.
    expect(listening('combat.ship-destroyed')).toBe(true);
    expect(listening('combat.decoy-intercept')).toBe(true);
    expect(listening('event.log')).toBe(true);
  });

  it('renders nothing if a combat.hit arrives anyway', () => {
    fire('combat.hit', hit({ weapon: 'torpedo', damageHull: 23 }));

    expect(screen.queryByText(/Sensors confirm/)).toBeNull();
    expect(screen.queryByText(/QuiteCat hits/)).toBeNull();
    expect(screen.queryByText(/hull -/i)).toBeNull();
  });

  it('renders nothing if a combat.phaser-fired arrives anyway', () => {
    fire('combat.phaser-fired', { shipId: LOCAL, bearing: 0, percent: 100, hyper: false });

    expect(screen.queryByText(/fires phasers/)).toBeNull();
  });

  /**
   * What the firer DOES see, and where it comes from: the server's relay of
   * canon's MTACC2, arriving as an ordinary event.log line. The `?` is canon's
   * own — `shpltr` returns it when the target is not in your scan table
   * (GEFUNCS.C:2591), which is the state a pilot is in after `sca sh` alone,
   * because only the range, local and data scans assign letters.
   */
  it('shows the server the canon hit line, verbatim', () => {
    fire('event.log', {
      category: 'combat',
      text: 'Sensors indicate our hyper-missile has hit ship ?, The Cyberquad 42066.',
    });

    expect(screen.getByTestId('event-log').textContent)
      .toContain('Sensors indicate our hyper-missile has hit ship ?, The Cyberquad 42066.');
  });
});
