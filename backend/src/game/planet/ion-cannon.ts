import { IDAMMAX } from '../constants';
import { Random } from '../combat/random.port';

/** `(gernd()%50)+40` — the shield knock an ion hit delivers. @see GEFUNCS.C:1802 */
export const ION_SHIELD_KNOCK_MIN = 40;
export const ION_SHIELD_KNOCK_SPREAD = 50;

export interface IonCannonHit {
  /** Added to the victim's hull damage. */
  hullDamage: number;
  /** Percentage passed to `shieldhit`; 0 when the shields were not up. */
  shieldKnock: number;
  /**
   * `ptr->lastfired = -1` — a pilot killed by a planet's guns hands the kill
   * to nobody. @see GEFUNCS.C:1796
   */
  clearsKillCredit: true;
}

/**
 * One ion-cannon volley from a planet the ship has attacked.
 *
 *   shields UP    damage += idammax * rndm(.15);  shieldhit((gernd()%50)+40)
 *   shields DOWN  damage += idammax * (rndm(.50) + .50)
 *
 * Raising shields turns a potentially fatal hit into a scratch and a heavy
 * shield drain — which is the whole tactical point of a planet's guns, and the
 * reason to stock them on a colony.
 *
 * @see GEFUNCS.C:1785-1812 fireion
 */
export function resolveIonCannonHit(rand: Random, shieldsUp: boolean): IonCannonHit {
  if (shieldsUp) {
    return {
      hullDamage: Math.floor(IDAMMAX * (rand.next() * 0.15)),
      shieldKnock: ION_SHIELD_KNOCK_MIN + Math.floor(rand.next() * ION_SHIELD_KNOCK_SPREAD),
      clearsKillCredit: true,
    };
  }
  return {
    hullDamage: Math.floor(IDAMMAX * (rand.next() * 0.5 + 0.5)),
    shieldKnock: 0,
    clearsKillCredit: true,
  };
}


/** @see GEFUNCS.C:1799, 1805 — IHIT1 (shields up) / IHIT2 (bare hull) */
export const PLANET_ION_FIRED = 'planet.ion-fired';

export interface PlanetIonFiredEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** 1-based planet number within the sector. */
  plnum: number;
  planetName: string;
  hullDamage: number;
  shieldKnock: number;
  shieldsUp: boolean;
}
