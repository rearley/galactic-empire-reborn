import { decideTradeAccess } from '../../src/game/planet/trade-access';

/**
 * `land` on another captain's planet carried its OWN copy of the access rule,
 * and the copy was broken. Its comment justified itself with two false claims:
 *
 *   // ship carries no explicit teamcode field
 *   // so we simply allow if arg === "team" OR if they know the real password
 *   if (arg === 'team' || arg === '') { ...admit... }
 *
 * ShipState.teamcode does exist (ship-state.types.ts:178), and the visitor's
 * team was never compared to the planet's — so on a team-locked world a bare
 * `land`, or `land team` from any stranger, was admitted. `decideTradeAccess`
 * already had the rule right; this pins the cases the private copy got wrong.
 */
const locked = { userid: 'usr_owner', password: 'team', teamcode: 42n };
const worded = { userid: 'usr_owner', password: 'hunter2', teamcode: 0n };
const open_ = { userid: 'usr_owner', password: 'none', teamcode: 0n };

describe('land access on another captain\'s planet', () => {
  it('refuses a stranger who supplies nothing to a team-locked world', () => {
    // The exact hole: bare `land`, no argument, not on the team.
    const r = decideTradeAccess(locked, 'usr_stranger', 0n, undefined);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('WRONG_TEAM');
  });

  it('refuses a stranger who merely types the word "team"', () => {
    const r = decideTradeAccess(locked, 'usr_stranger', 0n, 'team');
    expect(r.ok).toBe(false);
  });

  it('refuses a captain on a DIFFERENT team', () => {
    expect(decideTradeAccess(locked, 'usr_rival', 7n, undefined).ok).toBe(false);
  });

  it('admits an actual team-mate', () => {
    const r = decideTradeAccess(locked, 'usr_mate', 42n, undefined);
    expect(r.ok).toBe(true);
  });

  it('admits the owner unconditionally', () => {
    expect(decideTradeAccess(locked, 'usr_owner', 0n, undefined).ok).toBe(true);
  });

  it('still enforces a word password', () => {
    expect(decideTradeAccess(worded, 'usr_stranger', 0n, undefined).ok).toBe(false);
    expect(decideTradeAccess(worded, 'usr_stranger', 0n, 'wrong').ok).toBe(false);
    expect(decideTradeAccess(worded, 'usr_stranger', 0n, 'hunter2').ok).toBe(true);
  });

  it('lets anyone in when the owner set none', () => {
    expect(decideTradeAccess(open_, 'usr_stranger', 0n, undefined).ok).toBe(true);
  });
});
