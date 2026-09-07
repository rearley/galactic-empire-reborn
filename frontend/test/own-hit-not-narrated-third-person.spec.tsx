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
 * A pilot is in their own sector room, so the sector-wide COMBAT_HIT broadcast
 * comes back to the ship that fired it. `handlePhaserFired` has always guarded
 * against that (`if (event.shipId === localShipId) return;`); `handleCombatHit`
 * did not, so a player watched themselves in the third person:
 *
 *     QuiteCat hits Cybertron 43319 (phaser, hull -24%)
 *     Shields are now down, Sir!
 *     Phasers fired at 100 percent power - focus 1
 *     Sensors indicate we caused light damage to Commander ...'s ship!
 *
 * — the kill-feed line, then canon's own narration of the same shot, in that
 * order, because the broadcast leaves the server inside the command handler
 * while `command:result` is written only after it returns.
 *
 * Canon narrates a phaser hit to the FIRER itself (PHIT1/PHIT2, GECMDS.C:987-996)
 * and the port relays that, so the feed line is a duplicate there and goes.
 *
 * It does NOT go for torpedoes and missiles. Canon tells the firer nothing at
 * all — `checktm` prints THIT/MHIT to the victim's channel only
 * (GEFUNCS.C:1560, :1644) and credits the shooter through `acctm`, which is
 * scoring, not a message. This line is the only confirmation our players get
 * that a torpedo landed, and "nothing acknowledged the shot" is exactly the
 * complaint that made missiles feel broken. Information stays; the duplicated
 * voice goes.
 */
function fire(event: string, payload: unknown): void {
  const handler = handlers.get(event);
  expect(handler, `no client listener for '${event}'`).toBeDefined();
  act(() => handler!(payload));
}

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

describe('a pilot is not told about their own shot in the third person', () => {
  beforeEach(() => {
    handlers.clear();
    render(<App />);
  });

  it('drops the kill-feed line for the firer when canon already narrates it', () => {
    fire('combat.hit', hit());
    expect(screen.queryByText(/QuiteCat hits/)).toBeNull();
  });

  it('drops it for the hyper-phaser too — canon narrates that one as well', () => {
    fire('combat.hit', hit({ weapon: 'hyper-phaser' }));
    expect(screen.queryByText(/QuiteCat hits/)).toBeNull();
  });

  it('KEEPS it for a torpedo — canon gives the firer nothing else', () => {
    fire('combat.hit', hit({ weapon: 'torpedo', damageHull: 23 }));
    expect(screen.getByText(/QuiteCat hits Cybertron 43319 \(torpedo, hull -23%\)/)).toBeTruthy();
  });

  it('still narrates someone ELSE landing a phaser hit', () => {
    fire('combat.hit', hit({ attackerId: 'Cybrg-208:1', attackerName: 'Cybertron 43319',
      victimId: 'other:1', victimName: 'Wanderer' }));
    expect(screen.getByText(/Cybertron 43319 hits Wanderer/)).toBeTruthy();
  });

  it('still shows an INCOMING banner when the local ship is the victim', () => {
    fire('combat.hit', hit({ attackerId: 'Cybrg-208:1', attackerName: 'Cybertron 43319',
      victimId: LOCAL, weapon: 'torpedo', damageHull: 6, damageShield: 15 }));
    expect(screen.getByText(/INCOMING TORPEDO/)).toBeTruthy();
  });
});
