/**
 * A human captain's CUMULATIVE kill count must rise DURING a session, because
 * it is what moves the Cybertron difficulty gates.
 *
 * Canon's `killem` bumps the counter on the user record — `++(wuptr->kills)`,
 * GEFUNCS.C:1118 — and `chkcyb` reads that same live record when it decides
 * how hard to play (`warusroff(usrn)->kills`, GECYBS.C:441 and :524). In the
 * original there is one number and it is always current.
 *
 * This port has two: `Ship.kills` (per hull) and `User.kills` (cumulative),
 * with `ShipState.userKills` caching the latter. The cache was hydrated at
 * boot and at board time and never afterwards, so a captain's kills rose in
 * Postgres while the number the AI actually reads stayed frozen at whatever
 * it was when they logged in. `CYB_BE_NICE` is 30 and `CYB_BE_EASY` is 60, so
 * escalation could only ever happen to someone who logged out and back in —
 * the fix for the third layer of the Cybertron bug was correct and inert.
 *
 * @see GEFUNCS.C:1118 killem
 * @see GECYBS.C:441, :524 chkcyb
 */
import { resolveKillSpoils, KillSpoilsDeps } from '../../../src/game/combat/kill-resolution';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { escalationKills } from '../../../src/game/cybertron/cyb-decisions';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'T',
    energy: 50000,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    topspeed: 10,
    ...over,
  });
}

function harness(ships: ShipState[]): KillSpoilsDeps {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  return {
    mutate: (userid, shipno, fn) => {
      const s = map.get(shipKey(userid, shipno));
      if (s) fn(s);
    },
    maxTonsFor: () => 5000,
    random: { next: () => 0 },
  };
}

describe('cumulative kill count during a live session', () => {
  it('rises with each kill, so the escalation gates can actually be reached', () => {
    // A veteran one kill short of CYB_BE_NICE (30), already in the game.
    const attacker = makeShip({ userid: 'vet', shipno: 1, kills: 2, userKills: 29 });
    const victim = makeShip({ userid: 'prey', shipno: 2 });
    const deps = harness([attacker, victim]);

    expect(escalationKills(attacker)).toBe(29);

    resolveKillSpoils(victim, attacker, deps);

    expect(attacker.userKills).toBe(30);
    expect(escalationKills(attacker)).toBe(30);
  });

  it('still counts the per-hull kills alongside it', () => {
    const attacker = makeShip({ userid: 'vet', shipno: 1, kills: 2, userKills: 29 });
    const victim = makeShip({ userid: 'prey', shipno: 2 });
    resolveKillSpoils(victim, attacker, harness([attacker, victim]));
    expect(attacker.kills).toBe(3);
  });

  it('leaves an AI killer alone — Cybertrons have no User row to count against', () => {
    // userKills is undefined for AI, and escalationKills falls back to Ship.kills.
    const cyb = makeShip({ userid: 'Cybrg-221', shipno: 1, kills: 7, status: 2 });
    const victim = makeShip({ userid: 'prey', shipno: 2 });
    resolveKillSpoils(victim, cyb, harness([cyb, victim]));
    expect(cyb.userKills).toBeUndefined();
    expect(escalationKills(cyb)).toBe(8);
  });
});
