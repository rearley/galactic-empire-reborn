import { scanShipColour } from '../../src/game/commands/handlers/helpers/scan-ship-colour';
import { GESTAT_USER, GESTAT_AUTO } from '../../src/game/constants';

/**
 * Every scan mode drew AI ships as players and players as AI. The test was
 * `other.status === 1 ? 'ai' : 'human'`, but status 1 is GESTAT_USER — a
 * human (GEMAIN.H:210-211) — so the sense was exactly inverted in both the
 * range-scan and sector-scan builders.
 *
 * C keys the same distinction off GESTAT_AUTO, not off 1:
 *   if (wptr->status == GESTAT_AUTO)  mapc[..] = '1';   // AI
 *   else                              mapc[..] = '2';   // player
 *   — GECMDS.C:2622-2625
 *
 * Reported independently by the surveyor and the combat persona: a pilot
 * reading the map saw a Cybertron rendered as a fellow captain and vice versa,
 * which is the one distinction that decides whether you run or wave.
 */
describe('scanShipColour', () => {
  it('marks an AI hull as ai', () => {
    expect(scanShipColour(GESTAT_AUTO)).toBe('ai');
  });

  it('marks a player hull as human', () => {
    expect(scanShipColour(GESTAT_USER)).toBe('human');
  });

  it('does not treat status 1 as AI, which was the inversion', () => {
    expect(scanShipColour(1)).not.toBe('ai');
  });

  it('treats anything that is not GESTAT_AUTO as a player', () => {
    // Dormant/abandoned hulls are not AI; only GESTAT_AUTO is.
    expect(scanShipColour(0)).toBe('human');
    expect(scanShipColour(3)).toBe('human');
  });
});
