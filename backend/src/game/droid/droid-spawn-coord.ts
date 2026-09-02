import { Random } from '../combat/random.port';

/**
 * One axis of a droid's spawn position.
 *
 *   if (univmax < 20) {
 *       ptr->coord.xcoord = rndm((double)univmax*2.0) - (double)univmax;
 *   } else {
 *       ptr->coord.xcoord = rndm(39.9) - 19.8;
 *   }
 *   — GEDROIDS.C:131-140
 *
 * The port implemented only the `else`, scattering droids over ±19.8 sectors
 * in a galaxy that is ±10 (UNIVMAX defaults to 10, giving 21x21 = 441
 * sectors). Roughly half of every spawn landed outside the universe and was
 * wrapped on its first move, which is where the 20-sector teleports came from
 * — and why the Murdonian Transport, the designated starter target, was rarely
 * anywhere a new pilot could find it.
 */
export function rollDroidSpawnCoord(rng: Random, univmax: number): number {
  return univmax < 20
    ? rng.next() * univmax * 2.0 - univmax
    : rng.next() * 39.9 - 19.8;
}
