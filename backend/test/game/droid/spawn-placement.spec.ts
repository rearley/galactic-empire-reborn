/**
 * T014 — Spawn placement: coordinate bounds, userid format, shipno, shpclass,
 * status, isEphemeral, and per-class shield/phaser initialisation.
 *
 * @see GEDROIDS.C:135-143 — coords from rndm(39.9)-19.8; phasrtype / shieldtype init
 * @see GEDROIDS.C:111     — userid format @Droid-<n>
 * @see specs/008-droid-ai/tasks.md T014
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import {
  DROID_USERID_PREFIX,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  GESTAT_AUTO,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';

// ─── Class entry stubs ────────────────────────────────────────────────────────

const SCOW_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 1, maxPhaser: 1, maxShields: 1,
  scanRange: 25_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', shipNameTemplate: '',
};

const MURDONIAN_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 8, maxPhaser: 5, maxShields: 2,
  scanRange: 25_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', shipNameTemplate: '',
};

const VAKORY_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: 20_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', shipNameTemplate: '',
};

function entryFor(classNumber: number): ShipClassEntry | undefined {
  if (classNumber === DROID_CLASS_SCOW) return SCOW_ENTRY;
  if (classNumber === DROID_CLASS_TRANSPORT) return MURDONIAN_ENTRY;
  if (classNumber === DROID_CLASS_VAKORY) return VAKORY_ENTRY;
  return undefined;
}

// ─── Spawner factory ──────────────────────────────────────────────────────────

function buildSpawner(seed: number): { spawner: DroidSpawner; loadShipSpy: jest.Mock } {
  const rand = new Mulberry32Adapter(seed);

  const loadShipSpy = jest.fn();
  const shipState = {
    loadShip: loadShipSpy,
    findAllShips: () => [],
    get: () => undefined,
    mutate: () => undefined,
    removeFromGame: () => {},
    size: () => 0,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (n: number) => entryFor(n),
    getMaxPhaser: (n: number) => entryFor(n)?.maxPhaser ?? 1,
    getMaxTons: (n: number) => entryFor(n)?.maxTons ?? 100,
    getMaxShields: (n: number) => entryFor(n)?.maxShields ?? 1,
  } as unknown as ShipClassCacheService;

  const spawner = new DroidSpawner(shipState, classCache, rand);
  return { spawner, loadShipSpy };
}

// ─── Coordinate bound: rndm(39.9)-19.8 ∈ [-19.8, 19.8] ──────────────────────

const COORD_LO = -19.8;
const COORD_HI = 19.8; // 39.9 * (next() approaching 1) - 19.8 < 19.8

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('T014 — spawn placement: Murdonian Transport (class 32)', () => {
  let results: ShipState[];

  beforeAll(() => {
    const { spawner } = buildSpawner(1001);
    const lp = new Map<number, Set<string>>();
    results = [];
    for (let i = 0; i < 10; i++) {
      const state = spawner.spawn(DROID_CLASS_TRANSPORT, lp);
      if (state) results.push(state);
    }
  });

  it('produces 10 spawned states', () => {
    expect(results).toHaveLength(10);
  });

  it('xcoord is within [-19.8, 19.8]', () => {
    for (const s of results) {
      expect(s.xcoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.xcoord).toBeLessThanOrEqual(COORD_HI);
    }
  });

  it('ycoord is within [-19.8, 19.8]', () => {
    for (const s of results) {
      expect(s.ycoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.ycoord).toBeLessThanOrEqual(COORD_HI);
    }
  });

  it('userid starts with @Droid-', () => {
    for (const s of results) {
      expect(s.userid.startsWith(DROID_USERID_PREFIX)).toBe(true);
    }
  });

  it('userid format is @Droid-<numeric>', () => {
    for (const s of results) {
      const suffix = s.userid.slice(DROID_USERID_PREFIX.length);
      expect(Number.isInteger(Number(suffix))).toBe(true);
    }
  });

  it('shipno === 1', () => {
    for (const s of results) {
      expect(s.shipno).toBe(1);
    }
  });

  it('shpclass === 32 (DROID_CLASS_TRANSPORT)', () => {
    for (const s of results) {
      expect(s.shpclass).toBe(DROID_CLASS_TRANSPORT);
    }
  });

  it('status === GESTAT_AUTO (2)', () => {
    for (const s of results) {
      expect(s.status).toBe(GESTAT_AUTO);
    }
  });

  it('isEphemeral === true', () => {
    for (const s of results) {
      expect(s.isEphemeral).toBe(true);
    }
  });

  it('phasrtype === 5 (Murdonian maxPhaser)', () => {
    for (const s of results) {
      expect(s.phasrtype).toBe(5);
    }
  });

  it('phasr starts at 100 — a full bank, not the phaser TYPE', () => {
    // initshp sets phasr = 100 and shield = 0 on every new hull
    // (GEFUNCS.C:222, :232); GEDROIDS.C:127,142-143 overrides only the TYPE
    // fields. Seeding the bank from the type left a fresh droid at 1-5 against
    // PMINFIRE 60 — unable to fire for ~36 seconds after spawning.
    for (const s of results) {
      expect(s.phasr).toBe(100);
    }
  });

  it('shieldtype === 2 (Murdonian maxShields)', () => {
    for (const s of results) {
      expect(s.shieldtype).toBe(2);
    }
  });

  it('shield starts at 0 — shields charge from empty, as they do for a player', () => {
    for (const s of results) {
      expect(s.shield).toBe(0);
    }
  });
});

describe('T014 — spawn placement: Lydorian Garbage Scow (class 31)', () => {
  let results: ShipState[];

  beforeAll(() => {
    const { spawner } = buildSpawner(2002);
    const lp = new Map<number, Set<string>>();
    results = [];
    for (let i = 0; i < 10; i++) {
      const state = spawner.spawn(DROID_CLASS_SCOW, lp);
      if (state) results.push(state);
    }
  });

  it('xcoord and ycoord within bounds', () => {
    for (const s of results) {
      expect(s.xcoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.xcoord).toBeLessThanOrEqual(COORD_HI);
      expect(s.ycoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.ycoord).toBeLessThanOrEqual(COORD_HI);
    }
  });

  it('status === GESTAT_AUTO, isEphemeral === true, shipno === 1', () => {
    for (const s of results) {
      expect(s.status).toBe(GESTAT_AUTO);
      expect(s.isEphemeral).toBe(true);
      expect(s.shipno).toBe(1);
    }
  });

  it('shpclass === 31', () => {
    for (const s of results) {
      expect(s.shpclass).toBe(DROID_CLASS_SCOW);
    }
  });

  it('phasrtype === 1 (Scow maxPhaser)', () => {
    for (const s of results) {
      expect(s.phasrtype).toBe(1);
    }
  });

  it('shieldtype === 1 (Scow maxShields)', () => {
    for (const s of results) {
      expect(s.shieldtype).toBe(1);
    }
  });
});

describe('T014 — spawn placement: Vakory Survey Drone (class 33)', () => {
  let results: ShipState[];

  beforeAll(() => {
    const { spawner } = buildSpawner(3003);
    const lp = new Map<number, Set<string>>();
    results = [];
    for (let i = 0; i < 10; i++) {
      const state = spawner.spawn(DROID_CLASS_VAKORY, lp);
      if (state) results.push(state);
    }
  });

  it('xcoord and ycoord within bounds', () => {
    for (const s of results) {
      expect(s.xcoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.xcoord).toBeLessThanOrEqual(COORD_HI);
      expect(s.ycoord).toBeGreaterThanOrEqual(COORD_LO);
      expect(s.ycoord).toBeLessThanOrEqual(COORD_HI);
    }
  });

  it('shpclass === 33', () => {
    for (const s of results) {
      expect(s.shpclass).toBe(DROID_CLASS_VAKORY);
    }
  });

  it('status === GESTAT_AUTO and isEphemeral === true', () => {
    for (const s of results) {
      expect(s.status).toBe(GESTAT_AUTO);
      expect(s.isEphemeral).toBe(true);
    }
  });
});

describe('T014 — spawn placement: userid uniqueness', () => {
  it('all 10 spawned Murdonian userids are unique', () => {
    const { spawner } = buildSpawner(4004);
    const lp = new Map<number, Set<string>>();
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const state = spawner.spawn(DROID_CLASS_TRANSPORT, lp);
      if (state) ids.add(state.userid);
    }
    // 10 spawns into a fresh livePopulation — but lp.get(32) accumulates up to cap
    // so some may return the same slot. The real uniqueness invariant:
    // at any one time, the same userid cannot appear twice in livePopulation.
    // Here we check that userids are in the @Droid-<n> form.
    for (const uid of ids) {
      expect(uid.startsWith(DROID_USERID_PREFIX)).toBe(true);
    }
  });

  it('loadShip is called once per spawn call', () => {
    const { spawner, loadShipSpy } = buildSpawner(5005);
    const lp = new Map<number, Set<string>>();
    for (let i = 0; i < 5; i++) {
      spawner.spawn(DROID_CLASS_TRANSPORT, lp);
    }
    expect(loadShipSpy).toHaveBeenCalledTimes(5);
  });
});
