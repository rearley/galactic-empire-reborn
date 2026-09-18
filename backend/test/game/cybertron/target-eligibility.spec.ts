/**
 * Who a Cybertron is allowed to hunt is decided by two class columns, and the
 * port had each one holding the other's meaning.
 *
 * The wiki defines them (reference/wiki/player-ships.md, cpu-ships.md):
 *
 *   player table, "Cyb#"  — how many combative CPU ships will pursue this ship
 *                           simultaneously.            -> C `noclaim`
 *   CPU table,    "User"  — lowest player ship class this CPU will pursue
 *                           unprovoked (0 = pursues all). -> C `lowest_to_attk`
 *
 * C uses them from opposite sides of the engagement (GECYBS.C:709-720):
 *
 *   lta = shipclass[ptr->shpclass].lowest_to_attk - 1;     // the HUNTER's class
 *   if (lta <= wptr->shpclass && notclaimed(wptr,zothusn)) // the PREY's class
 *
 * and `notclaimed` returns `nc < shipclass[victim].noclaim` (GECYBS.C:357-376).
 *
 * The seed had player rows carrying Cyb# in `cybLowestClassAttacks` and CPU
 * rows carrying User in `noClaim` — so every CPU class had
 * `cybLowestClassAttacks = 0` and the lowest-class guard never fired, while
 * `notClaimed` read `noClaim` off the ATTACKING Cybertron instead of its prey.
 * Consequences: Heavy Freighters and Freight Barges (Cyb# = 0, "cannot be
 * attacked unprovoked") were claimable, and the gang-up limit was set by the
 * hunter rather than the hunted.
 */

import { canPursue, notClaimed } from '../../../src/game/cybertron/cyb-decisions';

describe('canPursue — the hunter\'s lowest_to_attk (GECYBS.C:711, 719)', () => {
  // NOT the Base Star, whose LATK is 20 (`MBMGESHP.MSG:5204` S23LATK) — at that
  // threshold it pursues no player class at all, since canon's USER classes are
  // 1-9 plus 41. This case pins the boundary value 1.
  // @see docs/DECISIONS.md 2026-09-18 — A Base Star is a station
  it('a hunter with User = 1 pursues every class', () => {
    for (const victimClass of [1, 3, 9, 34]) {
      expect(canPursue(1, victimClass)).toBe(true);
    }
  });

  it('a hunter with User = 10 pursues class 10 and up', () => {
    expect(canPursue(10, 9)).toBe(false);
    expect(canPursue(10, 10)).toBe(true);
    expect(canPursue(10, 41)).toBe(true);
  });

  it("C's -1 is an index-basis conversion, not part of the rule", () => {
    // These asserted `lta = lowest_to_attk - 1` applied to OUR class numbers,
    // which double-counts a conversion C has already made. `wptr->shpclass` is
    // a 0-BASED index into shipclass[]: GEMAIN.C:898 increments i once per
    // block, GECMDS.C:412 prints i+1 as the number the player sees, and
    // GECMDS.C:4562 parses a typed class with atoi()-1. Our shpclass is the
    // 1-based classNumber from the seed, so the threshold applies directly.
    //
    // The case that reached a player: the Sarten Obliterator has LATK 3. Canon
    // starts it at display class 3, the Heavy Freighter; subtracting again
    // pulled it down to class 2, the Stealth Fighter -- the ship a player
    // upgrades into straight after the Interceptor.
    expect(canPursue(3, 2)).toBe(false); // Stealth Fighter: exempt
    expect(canPursue(3, 3)).toBe(true);  // Heavy Freighter: fair game
  });

  it('User = 0 pursues all', () => {
    expect(canPursue(0, 1)).toBe(true);
  });
});

describe('notClaimed — the PREY\'s Cyb# (GECYBS.C:357-376)', () => {
  it('allows a claim while fewer than Cyb# Cybertrons hold this ship', () => {
    expect(notClaimed(0, 2)).toBe(true);
    expect(notClaimed(1, 2)).toBe(true);
  });

  it('refuses once Cyb# Cybertrons already hold it', () => {
    expect(notClaimed(2, 2)).toBe(false);
    expect(notClaimed(5, 2)).toBe(false);
  });

  it('Cyb# of 0 means never claimable unprovoked — the freighters', () => {
    // Heavy Freighter (3) and Freight Barge (9) both carry Cyb# = 0.
    // `nc < 0` is false for every nc, so C never claims them.
    expect(notClaimed(0, 0)).toBe(false);
  });
});
