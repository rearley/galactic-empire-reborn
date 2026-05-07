/**
 * Builds and loads ephemeral Droid ShipStates into the in-memory map.
 * Never writes to Prisma — all created states have isEphemeral=true.
 *
 * @see GEDROIDS.C:98 droid_init
 */

import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ShipStateService } from '../ship/ship-state.service';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { Random, RANDOM } from '../combat/random.port';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import {
  DROID_USERID_PREFIX,
  GESTAT_AUTO,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  CYBTICKTIME,
} from '../constants';
import { randomMurdonianLoadout, randomSparseLoadout } from './droid-decisions';

/** @see GEDROIDS.C:203-210 — typename dispatch in droid_lives */
const DROID_CLASS_TYPENAMES: Record<number, string> = {
  [31]: 'Lydorian Garbage Scow',
  [32]: 'Murdonian Transport',
  [33]: 'Vakory Survey Drone',
};

@Injectable()
export class DroidSpawner {
  /** Monotonic counter for allocating unique @Droid-<n> userids. Wraps at 9999. */
  private nextSlotIndex = 1;

  constructor(
    private readonly shipState: ShipStateService,
    private readonly classCache: ShipClassCacheService,
    @Inject(RANDOM) private readonly rng: Random,
  ) {}

  /**
   * Spawn one Droid of the given class. Loads it into ShipStateService with isEphemeral=true.
   * Returns the created ShipState, or null if the class is not recognized.
   * @see GEDROIDS.C:98-173 droid_init
   */
  spawn(classNumber: number, livePopulation: Map<number, Set<string>>): ShipState | null {
    const userid = this.allocateUserid(livePopulation);
    const shipno = 1;

    const cls = this.classCache.get(classNumber);
    const topspeed = cls?.maxWarp ?? 1; // @see GEMAIN.H — topspeed = max_warp factor
    const phasrtype = cls?.maxPhaser ?? 1;
    const shieldtype = cls?.maxShields ?? 1;
    const typename = DROID_CLASS_TYPENAMES[classNumber] ?? 'Droid';

    // @see GEDROIDS.C:129 — shipname = shipclass.shipname + usrn*usrn + gernd()%100
    const usrn = this.nextSlotIndex;
    const shipname = `${typename}${usrn * usrn + Math.floor(this.rng.next() * 100)}`;

    // @see GEDROIDS.C:135-140 — coords from rndm(39.9)-19.8
    const xcoord = this.rng.next() * 39.9 - 19.8;
    const ycoord = this.rng.next() * 39.9 - 19.8;

    // @see GEDROIDS.C:146-163 — loadout: Murdonian gets heavy load, others get sparse
    const items =
      classNumber === DROID_CLASS_TRANSPORT
        ? randomMurdonianLoadout(this.rng)
        : randomSparseLoadout(this.rng);

    // @see GEDROIDS.C:166 — speed2b = rndm(topspeed * 1000.0)
    const speed2b = this.rng.next() * (topspeed * 1000.0);

    // @see GEDROIDS.C:170 — tick = CYBTICKTIME + gernd()%CYBTICKTIME
    const tick = CYBTICKTIME + Math.floor(this.rng.next() * CYBTICKTIME);

    const state: ShipState = {
      userid,
      shipno,
      shipname,
      shpclass: classNumber,
      heading: this.rng.next() * 360,
      head2b: this.rng.next() * 360,
      speed: 0,
      speed2b,
      xcoord,
      ycoord,
      damage: 0,
      energy: 50_000,
      phasr: phasrtype, // start fully charged
      phasrtype,
      kills: 0,
      lastfired: -1,
      shieldtype,
      shieldstat: 0,
      shield: shieldtype,
      cloak: 0,
      degrees: 0,
      percent: 0,
      tactical: 0,
      helm: 0,
      train: 0,
      where: 0,
      ltorpsChannel: [255, 255, 255],
      ltorpsDistance: [0, 0, 0],
      lmisslChannel: [255, 255, 255],
      lmisslDistance: [0, 0, 0],
      lmisslEnergy: [0, 0, 0],
      decout: [],
      jammer: 0,
      freq: [],
      items,
      titem: 0,
      hostile: 0,
      cantexit: 0,
      repair: 0,
      hypha: 0,
      firecntl: 0,
      destruct: 0,
      status: GESTAT_AUTO,
      cybmine: 255,
      cybskill: 0,
      cybupdate: 0,
      tick,
      emulate: 0,
      minesnear: 0,
      lock: 0,
      holdcourse: 0,
      topspeed,
      warncntr: 0,
      navTargetX: null,
      navTargetY: null,
      scanNames: false,
      scanHome: false,
      dirty: false,
      isEphemeral: true,
    };

    this.shipState.loadShip(state);

    const pop = livePopulation.get(classNumber) ?? new Set<string>();
    pop.add(userid);
    livePopulation.set(classNumber, pop);

    return state;
  }

  /** Allocate the next available @Droid-<n> userid. */
  private allocateUserid(livePopulation: Map<number, Set<string>>): string {
    const allDroids = new Set<string>();
    for (const set of livePopulation.values()) {
      for (const uid of set) allDroids.add(uid);
    }

    let n = this.nextSlotIndex;
    for (let attempts = 0; attempts < 9999; attempts++) {
      const candidate = `${DROID_USERID_PREFIX}${n}`;
      if (!allDroids.has(candidate)) {
        this.nextSlotIndex = (n % 9999) + 1;
        return candidate;
      }
      n = (n % 9999) + 1;
    }
    // Fallback (should never happen with cap=6)
    return `${DROID_USERID_PREFIX}${Date.now()}`;
  }
}

// Re-export for use in module
export { DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY };
