import { cdistance } from '../../../combat/combat-math';

/**
 * Maximum distance, in C's 1/10,000 units, at which a ship may enter orbit.
 *
 * `distance = (unsigned)(cdistance(&warsptr->coord,&plptr->coord)*10000);
 *  if (distance <= 250) { ... where = 10 + plnum; } else prfmsg(ORBIT2);`
 *
 * This number is load-bearing for planetary defence, not just flavour.
 * `checkdist` drops `hostile` once an attacker is more than 1000 units from
 * the planet it attacked (GEFUNCS.C:907), and `fireion` only fires while
 * `hostile > 1` (GEFUNCS.C:1791). Because 250 < 1000, a ship in orbit is
 * always inside the window where the planet can shoot back. Remove the orbit
 * gate and the two constants stop interlocking: an attacker orbits from across
 * the sector, `hostile` is cleared on the next tick, and the colony's ion
 * cannons never fire.
 *
 * @see GECMDS.C cmd_orbit
 */
export const ORBIT_RANGE = 250;

/** True when `ship` is close enough to `planet` to enter orbit. */
export function canEnterOrbit(
  ship: { xcoord: number; ycoord: number },
  planet: { xcoord: number; ycoord: number },
): boolean {
  return Math.trunc(cdistance(ship, planet) * 10_000) <= ORBIT_RANGE;
}
