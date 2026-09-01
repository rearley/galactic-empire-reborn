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
  it('a Base Star (User = 1) pursues every class', () => {
    for (const victimClass of [1, 3, 9, 34]) {
      expect(canPursue(1, victimClass)).toBe(true);
    }
  });

  it('a Cybertron Scout (User = 10) pursues only class 9 and up', () => {
    // lta = 10 - 1 = 9; `lta <= wptr->shpclass`.
    expect(canPursue(10, 8)).toBe(false);
    expect(canPursue(10, 9)).toBe(true);
    expect(canPursue(10, 34)).toBe(true);
  });

  it('uses `>= lta`, not `>= lowest_to_attk` — the port was one class too strict', () => {
    expect(canPursue(6, 5)).toBe(true); // lta = 5
    expect(canPursue(6, 4)).toBe(false);
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
