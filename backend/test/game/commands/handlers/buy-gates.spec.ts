/**
 * Three gates on `buy` that the port got wrong at the door, before any of the
 * trade maths runs.
 *
 * 1. TEAM PASSWORD (GECMDS.C:4232-4246)
 *
 *      if (password == "team" && plptr->teamcode > 0
 *          && plptr->teamcode != waruptr->teamcode)   -> BUYPAS3, refuse
 *      else if (... plptr->teamcode == waruptr->teamcode) -> BUYPAS4, allow
 *
 *    The port never loaded the BUYER's teamcode at all — it refused whenever
 *    the planet's teamcode was non-zero, so a team's own members were locked
 *    out of their team's warehouse while everyone else walked in. BUYPAS4 is
 *    defined in messages.ts and was never emitted.
 *
 * 2. ABANDONED PLANETS (GECMDS.C:4322)
 *
 *      if (plptr->userid[0] != 0) { ... } else prfmsg(BUY7);
 *
 *    An ownerless planet is not a shop. BUY7 is defined and was never emitted.
 *    (Zygor is unaffected: the neutral-zone planets carry a non-null owner.)
 *
 * 3. THE OWNER'S OWN WAREHOUSE (GECMDS.C:4411-4415, and amt4sale)
 *
 *      if (sameas(plptr->userid, warsptr->userid) || sell == 'Y')
 *      ... forsale = plptr->items[item].qty;   // owner sees the FULL stock
 *
 *    Covered in planet-trade.spec.ts; `pri` already modelled it correctly, so
 *    quote and purchase disagreed.
 */

import { decideTradeAccess } from '../../../../src/game/planet/trade-access';

describe('decideTradeAccess — GECMDS.C:4232-4246, 4322', () => {
  const owned = { userid: 'owner', password: 'none', teamcode: 0n };

  it('lets the owner in regardless of password', () => {
    const r = decideTradeAccess({ ...owned, password: 'secret' }, 'owner', 0n, undefined);
    expect(r).toEqual({ ok: true });
  });

  it('refuses an ownerless planet — BUY7', () => {
    const r = decideTradeAccess({ userid: null, password: 'none', teamcode: 0n }, 'someone', 0n, undefined);
    expect(r).toEqual({ ok: false, reason: 'NO_OWNER' });
  });

  it('lets a team-mate trade, and says so — BUYPAS4', () => {
    const planet = { userid: 'owner', password: 'team', teamcode: 7n };
    expect(decideTradeAccess(planet, 'visitor', 7n, undefined)).toEqual({ ok: true, welcome: true });
  });

  it('refuses a stranger at a team-locked planet — BUYPAS3', () => {
    const planet = { userid: 'owner', password: 'team', teamcode: 7n };
    expect(decideTradeAccess(planet, 'visitor', 9n, undefined)).toEqual({ ok: false, reason: 'WRONG_TEAM' });
  });

  it('refuses a teamless visitor at a team-locked planet', () => {
    const planet = { userid: 'owner', password: 'team', teamcode: 7n };
    expect(decideTradeAccess(planet, 'visitor', 0n, undefined)).toEqual({ ok: false, reason: 'WRONG_TEAM' });
  });

  it('treats a "team" password with no teamcode as no gate at all', () => {
    // C requires `plptr->teamcode > 0` on both branches, so a planet flagged
    // for team trading but never assigned a team is simply open.
    const planet = { userid: 'owner', password: 'team', teamcode: 0n };
    expect(decideTradeAccess(planet, 'visitor', 3n, undefined)).toEqual({ ok: true });
  });

  it('accepts a matching plain password', () => {
    const planet = { userid: 'owner', password: 'hunter2', teamcode: 0n };
    expect(decideTradeAccess(planet, 'visitor', 0n, 'hunter2')).toEqual({ ok: true });
  });

  it('refuses a wrong or missing plain password', () => {
    const planet = { userid: 'owner', password: 'hunter2', teamcode: 0n };
    expect(decideTradeAccess(planet, 'visitor', 0n, 'nope')).toEqual({ ok: false, reason: 'BAD_PASSWORD' });
    expect(decideTradeAccess(planet, 'visitor', 0n, undefined)).toEqual({ ok: false, reason: 'BAD_PASSWORD' });
  });

  it('needs no password when the planet has none', () => {
    expect(decideTradeAccess(owned, 'visitor', 0n, undefined)).toEqual({ ok: true });
  });
});
