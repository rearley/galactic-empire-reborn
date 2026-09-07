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

  /**
   * REVISED by design decision, not by defect. This case previously asserted
   * that the firer keeps the full third-person feed line WITH its hull
   * percentage, on the grounds that canon leaves them with nothing at all.
   *
   * Canon's silence turns out to be deliberate rather than an omission: every
   * message about a torpedo after launch goes to the TARGET — the tracking
   * alert (TORP1), the decoy intercept (TORDEST, `outprfge(FILTER, usrn)` where
   * usrn is the carrier, GEFUNCS.C:1587-1588) and the impact (THIT1/THIT2). The
   * firer is meant to `sca sh <name>` and read `Damage: severe damage` off the
   * target. That is what the scan's damage line is FOR, and handing the shooter
   * a percentage removed the reason to type it.
   *
   * So: confirm the strike, report nothing about it. Sensors know something
   * connected; assessing it still costs a scan.
   *
   * @see docs/DECISIONS.md 2026-09-07 — firer-side ordnance confirmation
   */
  it('confirms a torpedo strike to the firer WITHOUT any damage figure', () => {
    fire('combat.hit', hit({ weapon: 'torpedo', damageHull: 23 }));

    const line = screen.getByText(/Sensors confirm a torpedo strike/);
    // Asserted whole, not by pattern: the ship's own NAME carries digits
    // ("Cybertron 43319"), so a /\d/ guard against "no numbers" matches the
    // target rather than the damage and passes for the wrong reason.
    expect(line.textContent).toBe('Sensors confirm a torpedo strike on Cybertron 43319.');
    expect(line.textContent).not.toContain('%');
    expect(screen.queryByText(/QuiteCat hits/)).toBeNull();
  });

  it('does the same for a missile', () => {
    fire('combat.hit', hit({ weapon: 'missile', damageHull: 40 }));

    const line = screen.getByText(/Sensors confirm a missile strike/);
    expect(line.textContent).toBe('Sensors confirm a missile strike on Cybertron 43319.');
    expect(line.textContent).not.toContain('%');
  });

  /**
   * REVISED by design decision — the last of the three. This asserted that a
   * bystander watching two other ships fight sees `X hits Y (phaser, hull -24%)`.
   *
   * Canon shows a bystander NOTHING about someone else's weapons fire. `PFIRED`
   * goes `outprfge(FILTER, usrn)` — to the firer alone (GECMDS.C:943-944) — and
   * every hit message is addressed to the firer or the victim. The sector-wide
   * broadcasts canon does make are cloak collapse (GEFUNCS.C:1380), the
   * self-destruct countdown (:1836), sector entry/exit (:717-722), radio
   * traffic and the destruction energy burst. Combat is not among them: if you
   * want to know whether the two ships off your bow are fighting, you scan
   * them and read their damage.
   *
   * Both port lines go — the hit line here and `X fires phasers!` — leaving the
   * energy burst on a kill as the only thing a third party is told, which is
   * canon's own (`outrange(ALWAYS, ...)`).
   *
   * @see docs/DECISIONS.md 2026-09-07
   */
  it('says nothing to a bystander about a fight between two other ships', () => {
    fire('combat.hit', hit({ attackerId: 'Cybrg-208:1', attackerName: 'Cybertron 43319',
      victimId: 'other:1', victimName: 'Wanderer' }));

    expect(screen.queryByText(/Cybertron 43319 hits Wanderer/)).toBeNull();
    expect(screen.queryByText(/hull -/)).toBeNull();
  });

  it('says nothing to a bystander when another ship fires phasers', () => {
    fire('combat.phaser-fired', { shipId: 'Cybrg-208:1' });

    expect(screen.queryByText(/fires phasers/)).toBeNull();
  });

  /**
   * REVISED by design decision, not by defect — the victim half of the same
   * call. This asserted that a pilot taking a hit sees
   *
   *     ** INCOMING TORPEDO! Hull -6% shields -15% from Cybertron 43319 **
   *
   * on top of canon's own `THIT2`, which the gateway already relays to the
   * victim's user room. Two departures in one line: canon reports hull damage
   * as a NUMBER nowhere in the game — not to the attacker (PHITHIM), not to the
   * victim (THIT2 gives no magnitude at all), not even to you about your own
   * ship (REP14 passes the damstr word, GECMDS.C:2037-2040) — and canon names
   * the attacker at LAUNCH (TFIRE2, by scan letter) but deliberately not at
   * impact.
   *
   * So the banner goes and canon's text stands alone: you are told you were
   * hit and by what weapon, and `rep` tells you your condition in words.
   *
   * @see docs/DECISIONS.md 2026-09-07
   */
  it('renders no extra banner when the local ship is the victim — canon THIT2 stands alone', () => {
    fire('combat.hit', hit({ attackerId: 'Cybrg-208:1', attackerName: 'Cybertron 43319',
      victimId: LOCAL, weapon: 'torpedo', damageHull: 6, damageShield: 15 }));

    expect(screen.queryByText(/INCOMING/)).toBeNull();
    expect(screen.queryByText(/Hull -/)).toBeNull();
  });

  /**
   * The line the player actually reads on being hit arrives on `event.log`,
   * emitted by the gateway to the victim's user room with canon's own text.
   * Pinned here so removing the banner cannot be mistaken for removing the
   * notification.
   */
  it('canon THIT2 still reaches the victim over event.log', () => {
    fire('event.log', {
      category: 'combat',
      text: 'We have taken a hit from a torpedo, Sir! Damage control has been notified.',
    });
    expect(screen.getByText(/We have taken a hit from a torpedo/)).toBeTruthy();
  });
});
