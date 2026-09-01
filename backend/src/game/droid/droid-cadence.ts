import { CYBTICKTIME } from '../constants';
import { Random } from '../combat/random.port';

/**
 * How long until this droid acts again, in SECONDS.
 *
 *   if (ptr->cantexit == 0) tick = (CYBTICKTIME + gernd()%CYBTICKTIME) * 3;
 *   else                    tick =  CYBTICKTIME + gernd()%CYBTICKTIME;
 *
 * A droid that is battle-locked reacts roughly three times as often as one
 * that is merely cruising — which is the whole reason engaging one feels
 * different from passing one. The port ignored `tick` entirely and ran every
 * droid together on a global 30-physics-tick gate, so an engaged droid was
 * about 3.5x too slow and the whole population moved in lockstep.
 *
 * @see GEDROIDS.C:216-227  @see GEMAIN.C:2406-2424
 */
export function nextDroidTick(cantexit: number, rand: Random): number {
  const base = CYBTICKTIME + Math.floor(rand.next() * CYBTICKTIME);
  return cantexit === 0 ? base * 3 : base;
}
