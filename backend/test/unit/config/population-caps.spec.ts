/**
 * Population caps — MAXPLRS, MAXPLNTS, MAXDROID.
 *
 * The original enforced these; this port declared them in the sysop config but
 * left them inert, so player registration was unbounded and nothing tied
 * population to galaxy size.
 *
 * Semantics taken from the C, and they are not all what the names suggest:
 *
 *   MAXPLRS  gates ENTRY to the game. GEMAIN.C:2769 — `if (numwar < gemaxplrs)`
 *            board a ship, else print NOSHPS. `numwar` is the count of players
 *            currently in the game, so this is a CONCURRENT cap, not a
 *            registration cap: accounts are unlimited, seats are not.
 *
 *   MAXPLNTS is PER PLAYER, not galaxy-wide. GECMDS.C:3487 —
 *            `if (waruptr->planets >= max_plnts)` refuses another claim.
 *
 *   MAXDROID caps the droid population.
 *
 *   NUMSHIPS is deliberately NOT enforced: in C it only sizes the ship array
 *            (`nships = nterms + numships`, GEMAIN.C:697). There is no runtime
 *            gate on it, so adding one would be an invention.
 */

import { SYSOP_OPTIONS } from '../../../src/game/config/game-config';
import { MAXPLRS, MAXPLNTS, MAXDROID } from '../../../src/game/constants';

describe('population cap constants are wired to the sysop config', () => {
  it('exposes MAXPLRS, MAXPLNTS and MAXDROID as live constants', () => {
    expect(typeof MAXPLRS).toBe('number');
    expect(typeof MAXPLNTS).toBe('number');
    expect(typeof MAXDROID).toBe('number');
  });

  it('each sits inside the range the original enforced', () => {
    expect(MAXPLRS).toBeGreaterThanOrEqual(SYSOP_OPTIONS.MAXPLRS.min);
    expect(MAXPLRS).toBeLessThanOrEqual(SYSOP_OPTIONS.MAXPLRS.max);
    expect(MAXPLNTS).toBeGreaterThanOrEqual(SYSOP_OPTIONS.MAXPLNTS.min);
    expect(MAXPLNTS).toBeLessThanOrEqual(SYSOP_OPTIONS.MAXPLNTS.max);
    expect(MAXDROID).toBeGreaterThanOrEqual(SYSOP_OPTIONS.MAXDROID.min);
    expect(MAXDROID).toBeLessThanOrEqual(SYSOP_OPTIONS.MAXDROID.max);
  });

  it('marks all three as implemented in the registry', () => {
    expect(SYSOP_OPTIONS.MAXPLRS.implemented).toBe(true);
    expect(SYSOP_OPTIONS.MAXPLNTS.implemented).toBe(true);
    expect(SYSOP_OPTIONS.MAXDROID.implemented).toBe(true);
  });

  it('leaves NUMSHIPS declared but unenforced, with the reason recorded', () => {
    expect(SYSOP_OPTIONS.NUMSHIPS.implemented).toBe(false);
    expect(SYSOP_OPTIONS.NUMSHIPS.note).toMatch(/array|siz/i);
  });

  it('the galaxy can hold the seated players — 450 sectors for MAXPLRS seats', () => {
    // A sanity relationship rather than a hard rule: the 30x15 grid is 450
    // sectors, so a full house must not exceed one player per sector.
    expect(MAXPLRS).toBeLessThanOrEqual(30 * 15);
  });
});
