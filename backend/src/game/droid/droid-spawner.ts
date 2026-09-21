/**
 * Builds and loads ephemeral Droid ShipStates into the in-memory map.
 * Never writes to Prisma — all created states have isEphemeral=true.
 *
 * @see GEDROIDS.C:98 droid_init
 */

import { Injectable } from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
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
import { rollDroidSpawnCoord } from './droid-spawn-coord';
import { UNIVMAX } from '../constants';
import { AI_HOUSE_RULES, PORT_RULES, type AiHouseRules } from '../ai/house-rules';

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

  /**
   * DEV-ONLY freeze registry, keyed by shipKey(userid, shipno).
   *
   * `stationary` used to be a creation-time-only tweak: the spawner set
   * `speed2b = 0` and the droid AI then rolled a fresh drift speed the instant
   * it saw a player — canon, GEDROIDS.C:328-331
   * `if (ptr->holdcourse == 0) ptr->speed2b = rndm(999.9);`. That is correct
   * behaviour for the game and is not changed. But it made the playtest
   * override useless: a droid asked to hold still drifted 149 -> 839 units over
   * four minutes, and because phaser falloff is dd^PFIRDST (a sysop option,
   * shipped at 5: MBMGEMSG.MSG:417, read at GEMAIN.C:493) that
   * silently moved every damage number we measured.
   *
   * A droid whose key is in here is re-zeroed by DroidTickService after the AI
   * has run, so range is a controlled variable. Only the explicit
   * `stationary === true` argument — reachable solely from the debug spawn
   * endpoint — puts a key in; the normal spawn path always clears it.
   */
  private readonly frozen = new Set<string>();

  /** DEV-ONLY: is this droid pinned in place for a playtest? */
  isFrozen(userid: string, shipno: number): boolean {
    return this.frozen.has(shipKey(userid, shipno));
  }

  /** DEV-ONLY: release a freeze (called when the droid dies, so keys cannot leak). */
  unfreeze(userid: string, shipno: number): void {
    this.frozen.delete(shipKey(userid, shipno));
  }

  constructor(
    private readonly shipState: ShipStateService,
    private readonly classCache: ShipClassCacheService,
    @Inject(RANDOM) private readonly rng: Random,
    // The port's AI house rules; production binds nothing and runs them all.
    @Optional() @Inject(AI_HOUSE_RULES) private readonly rules: AiHouseRules = PORT_RULES,
  ) {}

  /**
   * Spawn one Droid of the given class. Loads it into ShipStateService with isEphemeral=true.
   * Returns the created ShipState, or null if the class is not recognized.
   * @see GEDROIDS.C:98-173 droid_init
   */
  spawn(
    classNumber: number,
    livePopulation: Map<number, Set<string>>,
    /**
     * Dev-only placement override. When supplied the droid is dropped at
     * exactly these coordinates instead of being scattered, so a playtester can
     * get a target in front of them. Bypasses the neutral-zone re-roll too.
     */
    at?: { x: number; y: number },
    /** Dev-only: spawn stationary so a playtester can land repeatable hits. */
    stationary?: boolean,
    /**
     * Dev-only explicit name. The generated name collides readily, and `loc`
     * matches globally by name, so tests need an unambiguous target.
     */
    nameOverride?: string,
  ): ShipState | null {
    const userid = this.allocateUserid(livePopulation);
    const shipno = 1;

    const cls = this.classCache.get(classNumber);
    const topspeed = cls?.maxWarp ?? 1; // @see GEMAIN.H — topspeed = max_warp factor
    const phasrtype = cls?.maxPhaser ?? 1;
    const shieldtype = cls?.maxShields ?? 1;
    // GEDROIDS.C:203-210 dispatches BEHAVIOUR on typename; the display name is
    // built from SNAME, a different column: sprintf("%s%u", shipclass.shipname,
    // usrn*usrn + gernd()%100) at GEDROIDS.C:129. The port used the type name
    // for both, so a Murdonian announced itself as "Murdonian Transport217"
    // instead of canon's "Trans-Gal #2217".
    const typename = DROID_CLASS_TYPENAMES[classNumber] ?? 'Droid';
    const namePrefix = this.classCache.get(classNumber)?.shipNameTemplate || typename;

    // @see GEDROIDS.C:129 — shipname = shipclass.shipname + usrn*usrn + gernd()%100
    const usrn = this.nextSlotIndex;
    const shipname = nameOverride ?? this.uniqueGeneratedName(namePrefix, usrn);

    // @see GEDROIDS.C:131-140 — C branches on universe size; the port only had
    // the large-universe arm, so half of every spawn landed outside a galaxy
    // that is +/-10.
    // PORT-ORIGINAL @house-rule droidsSpawnOutsideZone: re-roll if the neutral
    // zone (0,0) comes up. Canon places a droid anywhere.
    let xcoord: number, ycoord: number;
    if (at) {
      xcoord = at.x;
      ycoord = at.y;
    } else {
      do {
        xcoord = rollDroidSpawnCoord(this.rng, UNIVMAX);
        ycoord = rollDroidSpawnCoord(this.rng, UNIVMAX);
      } while (this.rules.droidsSpawnOutsideZone && Math.floor(xcoord) === 0 && Math.floor(ycoord) === 0);
    }

    // @see GEDROIDS.C:146-163 — loadout: Murdonian gets heavy load, others get sparse
    const items =
      classNumber === DROID_CLASS_TRANSPORT
        ? randomMurdonianLoadout(this.rng)
        : randomSparseLoadout(this.rng);

    // @see GEDROIDS.C:166 — speed2b = rndm(topspeed * 1000.0)
    const speed2b = stationary ? 0 : this.rng.next() * (topspeed * 1000.0);

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
      // initshp gives every new hull a FULL phaser bank and no shield charge
      // (GEFUNCS.C:222, :232); GEDROIDS.C:127,142-143 overrides only the TYPE
      // fields. Seeding phasr from phasrtype left a fresh droid at 1-5 against
      // PMINFIRE 60, so it could not fire for ~36 seconds after spawning, and
      // seeding shield from shieldtype started it part-charged.
      // cybertron.repository.ts already used 100; the droid spawner was the
      // outlier.
      phasr: 100,
      phasrtype,
      kills: 0,
      lastfired: -1,
      shieldtype,
      shieldstat: 0,
      shield: 0,
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
      scanNames: false,
      scanHome: false,
      scanFull: false,
      msgFilter: false,
      dirty: false,
      isEphemeral: true,
    };

    // Userids are recycled (allocateUserid wraps at 9999), so a normal spawn
    // must actively CLEAR any stale freeze on the key it just claimed —
    // otherwise a dev-frozen slot could silently pin a later live droid.
    if (stationary === true) {
      this.frozen.add(shipKey(userid, shipno));
    } else {
      this.frozen.delete(shipKey(userid, shipno));
    }

    this.shipState.loadShip(state);

    const pop = livePopulation.get(classNumber) ?? new Set<string>();
    pop.add(userid);
    livePopulation.set(classNumber, pop);

    return state;
  }

  /** Allocate the next available @Droid-<n> userid. */
  /**
   * Build the canonical droid name, then ensure it does not collide with a ship
   * already in play.
   *
   * C uses `shipclass.shipname + (usrn*usrn + gernd()%100)` (GEDROIDS.C:129).
   * Across low `usrn` values those ranges overlap heavily — usrn 1 spans 1..100
   * and usrn 2 spans 4..103 — so duplicates are common. That matters here
   * because name lookups (`loc`, `scan sh`) resolve via
   * ShipStateService.findByName, which returns the FIRST match: a duplicate
   * makes the player address a different ship than the one they named. Observed
   * in playtest as a lock landing on a same-named droid across the galaxy.
   *
   * The canonical formula is tried first and kept whenever it is already
   * unique, so ordinary names are unchanged.
   */
  private uniqueGeneratedName(typename: string, usrn: number): string {
    const base = usrn * usrn;
    // findAllShips rather than findByName: the latter also does prefix and
    // substring matching, which would reject far more names than are actually
    // taken, and it is stubbed in fewer of the existing droid test harnesses.
    const taken = new Set(
      (this.shipState.findAllShips() ?? []).map((s) => s.shipname.toLowerCase()),
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = `${typename}${base + Math.floor(this.rng.next() * 100)}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    // Exhausted the canonical space — fall back to something guaranteed unique.
    return `${typename}${base}-${usrn}`;
  }

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
