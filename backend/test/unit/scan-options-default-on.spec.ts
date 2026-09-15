/**
 * SCANNAMES and SCANFULL default ON — a deliberate deviation from canon.
 *
 * Canon zeroes every `WARUSR.options[]` byte, and that was right in 1988: a
 * scan printed into the same scrolling log as everything else, so extra detail
 * cost you the screen. This port renders scans into their own fixed panel
 * (`ScanPanel.tsx`), which is on screen either way — so with SCANFULL off, a
 * region that is already occupying space simply sits emptier, for a reason that
 * no longer exists. Raised by a player on 2026-09-15.
 *
 * The options themselves are NOT removed. They are canon by exact name
 * (GECMDS.C:5197 `char	*options[NUMOPTS]={`) and anyone who wants a sparser
 * readout keeps it.
 *
 * @see docs/DECISIONS.md 2026-09-15  @see GUIDE_DEVIATIONS
 */
import { describe, it, expect } from 'vitest';
import { applySessionProfile } from '../../src/game/ship/session-profile';
import { OPTION_DEFAULTS, SET_OPTIONS_CATALOG } from '../../src/game/commands/handlers/set-options.catalog';
import type { ShipState } from '../../src/game/ship/ship-state.types';

const blank = () => ({} as ShipState);
const profile = (options: number[]) => ({
  teamcode: null, options, kills: 0, username: 'Ripley', fkeys: [],
});

describe('the defaults', () => {
  it('turns the two scan-detail options on and leaves the rest alone', () => {
    expect(OPTION_DEFAULTS).toEqual([1, 0, 1, 0]);
  });

  it('has exactly one default per catalog entry', () => {
    // A fifth option added without a default would read as `undefined` and
    // silently evaluate to off everywhere.
    expect(OPTION_DEFAULTS).toHaveLength(SET_OPTIONS_CATALOG.length);
  });
});

describe('a player who has never run `set`', () => {
  it('gets names and full detail without asking', () => {
    // Registration writes `options: []`, so every slot is ABSENT rather than
    // off — which is what makes this reachable without a data migration.
    const s = blank();
    applySessionProfile(s, profile([]));
    expect(s.scanNames).toBe(true);
    expect(s.scanFull).toBe(true);
  });

  it('still gets canon behaviour for the other two', () => {
    // scanhome is append-vs-overwrite, a real preference rather than a
    // vestige, and filter suppresses messages. Neither reason evaporated.
    const s = blank();
    applySessionProfile(s, profile([]));
    expect(s.scanHome).toBe(false);
    expect(s.msgFilter).toBe(false);
  });
});

describe('a player who turned them off on purpose', () => {
  it('keeps them off', () => {
    // The whole point of not removing the options. An explicit 0 is a choice
    // and outranks the default.
    const s = blank();
    applySessionProfile(s, profile([0, 0, 0, 0]));
    expect(s.scanNames).toBe(false);
    expect(s.scanFull).toBe(false);
  });

  it('is not overridden by a short array either', () => {
    // `set scannames off` writes [0] and nothing more; slot 2 is still absent
    // and must still default ON.
    const s = blank();
    applySessionProfile(s, profile([0]));
    expect(s.scanNames).toBe(false);
    expect(s.scanFull).toBe(true);
  });
});
