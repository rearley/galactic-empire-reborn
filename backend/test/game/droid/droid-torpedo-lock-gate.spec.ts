/**
 * A Droid's torpedoes pass the same lock check as everyone else's.
 *
 * Canon has ONE torpedo path: `cmd_torp`, `cyb_attack` and the Droid brain all
 * call `torp()` (GECMDS.C:1188, GECYBS.C:538, GEDROIDS.C:482), and `torp()`
 * opens with `lockon()`. The arithmetic is a hard zero when the TARGET is above
 * warp 1, and otherwise
 * `(1.2 - (firer.speed + target.speed)/5000) * ((5 - dist)/tor_fact)` needing
 * to clear 0.7 (GECMDS.C:1378-1395).
 *
 * The lock guard was added to BOTH AI brains on 2026-09-09, after an Obliterator
 * at warp 14 volleyed a Dreadnought to death with torpedoes canon could never
 * have fired. Only the Cybertron half was tested. A coverage audit the next day
 * found the Droid's copy sitting on an uncovered branch — the same defect class,
 * in the half nobody exercised.
 *
 * These cases go through `actClass12`, the real Vakory brain, rather than
 * calling the launch helper directly. A test that pokes the helper proves the
 * helper works and says nothing about whether the brain reaches it, which is
 * exactly how the gap survived.
 *
 * @see GEDROIDS.C:476-483
 * @see docs/TEST_STRATEGY.md — test the caller's arithmetic, not the function's
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import {
  DROID_CLASS_VAKORY, DROID_USERID_PREFIX, GESTAT_USER, PMINFIRE,
} from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'p1', shipno: 1, shipname: 'Victim', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 5, kills: 0, lastfired: -1,
    shieldtype: 2, shieldstat: 0, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_USER, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 6, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

const CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 8, maxPhaser: 5, maxShields: 2,
  scanRange: 250_000, maxTons: 100, hasTorpedo: true, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false,
  noClaim: 0, tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100, typeName: 'Vakory Survey Drone',
  category: 'CPU_DROID', shipNameTemplate: '',
} as unknown as ShipClassEntry;

/**
 * A Vakory that has been shot at — `lastfired` set to the victim's channel is
 * what makes the brain fight back rather than drift. Damage stays under the
 * flee threshold so the fight-back branch is the one taken.
 */
function buildHarness(droidSpeed: number, target: ShipState) {
  // Fixed high draw: `rollVakoryTorpedoVolley` is floor(rng * 2), so 0.99
  // always yields a one-torpedo volley. Seeded randomness would make the
  // baseline case depend on draw order rather than on the lock, which is the
  // only thing these cases are about.
  const rand = { next: () => 0.99 } as unknown as Mulberry32Adapter;
  const events = new EventEmitter2();
  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Vakory',
    shpclass: DROID_CLASS_VAKORY, status: 2, isEphemeral: true,
    speed: droidSpeed, phasr: PMINFIRE, damage: 0,
    // Fight-back needs BOTH: `cantexit > 0 && lastfired > 0` (GEDROIDS.C:443).
    // cantexit is the battle lock set when something fires on you.
    cantexit: 5, lastfired: target.channel ?? 2, channel: 1,
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${droid.userid}:1`, droid);
  shipMap.set(`${target.userid}:${target.shipno}`, target);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${u}:${n}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: jest.fn(),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: () => CLASS_ENTRY,
    getMaxPhaser: () => 5,
    getMaxTons: () => 100,
    getMaxShields: () => 2,
    getScanRange: () => 250_000,
  } as unknown as ShipClassCacheService;

  const svc = new DroidTickService(
    { subscribe: jest.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, rand),
    { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry,
    { create: jest.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    events, rand,
  );
  return { svc, droid, target };
}

/** Torpedoes queued onto the victim by the Droid. */
function torpedoesOn(target: ShipState): number {
  return target.ltorpsChannel.filter((c) => c !== undefined && c !== 255).length;
}

function act(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass12: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass12(droid, players, 250_000, 1);
}

describe('a Droid torpedo passes the lock check the player command uses', () => {
  it('fires when both ships are slow and close — the baseline that must keep working', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0 });
    const { svc, droid } = buildHarness(0, target);
    act(svc, droid, [target]);
    expect(torpedoesOn(target)).toBeGreaterThan(0);
  });

  it('does NOT fire while the Droid itself is at warp', () => {
    // Speed term alone: 1.2 - 14030/5000 = -1.61. No distance rescues it.
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0 });
    const { svc, droid } = buildHarness(14_030, target);
    act(svc, droid, [target]);
    expect(torpedoesOn(target)).toBe(0);
  });

  it('does NOT fire at a target that is itself at warp', () => {
    // `if (wptr->speed > 999) fact = 0` — a hard zero on the TARGET's speed,
    // whatever the firer is doing. This is why canon's help says keep moving.
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0, speed: 1_000,
    });
    const { svc, droid } = buildHarness(0, target);
    act(svc, droid, [target]);
    expect(torpedoesOn(target)).toBe(0);
  });

  it('does NOT fire from beyond the lock envelope even at a dead stop', () => {
    // A stationary firer reaches 2.67 sectors. At 3.5 the factor is
    // 1.2 * ((5 - 3.5)/4) = 0.45, under the 0.7 threshold.
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3.5, ycoord: 0 });
    const { svc, droid } = buildHarness(0, target);
    act(svc, droid, [target]);
    expect(torpedoesOn(target)).toBe(0);
  });
});
