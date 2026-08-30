/**
 * Dev-only placement override for combat playtesting.
 *
 * DroidSpawner normally scatters droids across the universe
 * (GEDROIDS.C:135-140, `rndm(39.9)-19.8`), which makes hands-on combat testing
 * impractical — a player has no way to get a target in front of them. `spawn()`
 * accepts an optional coordinate override so the debug endpoint can drop a
 * target at a known position. Everything else about the spawn is unchanged.
 */

import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DROID_CLASS_TRANSPORT } from '../../../src/game/constants';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function buildSpawner(seed: number) {
  const loaded: ShipState[] = [];
  const shipState = {
    loadShip: (s: ShipState) => { loaded.push(s); },
    // Name de-duplication consults findByName; without it the spawner cannot
    // tell whether a generated name is already taken.
    findByName: (n: string) => loaded.find((e) => e.shipname.toLowerCase() === n.toLowerCase()),
    findAllShips: () => loaded,
    get: () => undefined,
    mutate: () => undefined,
    removeFromGame: () => {},
    size: () => 0,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const entry = { maxWarp: 3, maxPhaser: 5, maxShields: 2, maxTons: 100 };
  const classCache = {
    get: () => entry,
    getMaxPhaser: () => entry.maxPhaser,
    getMaxTons: () => entry.maxTons,
    getMaxShields: () => entry.maxShields,
  } as unknown as ShipClassCacheService;

  return { spawner: new DroidSpawner(shipState, classCache, new Mulberry32Adapter(seed)), loaded };
}

describe('DroidSpawner — coordinate override', () => {
  it('places the droid exactly at the requested coordinates', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 5.25, y: 7.5 });
    expect(state).not.toBeNull();
    expect(state!.xcoord).toBe(5.25);
    expect(state!.ycoord).toBe(7.5);
  });

  it('honours the override even inside the neutral zone, which random placement re-rolls', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 0.5, y: 0.5 });
    expect(state!.xcoord).toBe(0.5);
    expect(state!.ycoord).toBe(0.5);
  });

  it('still scatters randomly when no override is given', () => {
    const { spawner } = buildSpawner(42);
    const a = spawner.spawn(DROID_CLASS_TRANSPORT, new Map());
    const b = spawner.spawn(DROID_CLASS_TRANSPORT, new Map());
    expect(a!.xcoord).not.toBe(b!.xcoord);
    for (const s of [a!, b!]) {
      expect(s.xcoord).toBeGreaterThanOrEqual(-19.8);
      expect(s.xcoord).toBeLessThanOrEqual(19.8);
    }
  });

  it('spawns stationary when asked, so a lock can be held long enough to fire', () => {
    // Droids normally get `speed2b = rndm(topspeed * 1000)` (GEDROIDS.C:166),
    // which outruns a torpedo lock during a hands-on test.
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 }, true)!;
    expect(state.speed2b).toBe(0);
  });

  it('still drifts by default', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 })!;
    expect(state.speed2b).toBeGreaterThan(0);
  });

  it('generates a name that does not collide with a live ship', () => {
    // C builds the name as `shipclass.shipname + (usrn*usrn + gernd()%100)`
    // (GEDROIDS.C:129). Across the low usrn values those ranges overlap
    // heavily — usrn 1 spans 1..100, usrn 2 spans 4..103 — so duplicates are
    // common. Name lookups (`loc`, `scan sh`) resolve by name and return the
    // first match, so a duplicate makes the player address the wrong ship.
    const existing: ShipState[] = [];
    const shipState = {
      loadShip: (st: ShipState) => { existing.push(st); },
      findAllShips: () => existing,
      get: () => undefined,
      mutate: () => undefined,
      removeFromGame: () => {},
      size: () => existing.length,
      findByUserid: () => [],
    } as unknown as ShipStateService;

    const entry = { maxWarp: 3, maxPhaser: 5, maxShields: 2, maxTons: 100 };
    const classCache = {
      get: () => entry,
      getMaxPhaser: () => entry.maxPhaser,
      getMaxTons: () => entry.maxTons,
      getMaxShields: () => entry.maxShields,
    } as unknown as ShipClassCacheService;

    // Same seed for every spawn => the same generated name every time, unless
    // the spawner actively de-duplicates.
    const names = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const spawner = new DroidSpawner(shipState, classCache, new Mulberry32Adapter(7));
      const st = spawner.spawn(DROID_CLASS_TRANSPORT, new Map())!;
      names.add(st.shipname);
    }
    expect(names.size).toBe(5);
  });

  it('accepts an explicit name so a test can address exactly one target', () => {
    // The generated name is `${typename}${usrn*usrn + rnd%100}` (GEDROIDS.C:155),
    // which collides readily. `loc <name>` matches globally by name, so an
    // ambiguous name makes a browser test lock a droid on the far side of the
    // galaxy and report "out of scanner range".
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 }, true, 'E2ETarget-XYZ')!;
    expect(state.shipname).toBe('E2ETarget-XYZ');
  });

  it('falls back to the generated name when none is supplied', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 })!;
    expect(state.shipname).toMatch(/Murdonian Transport\d+/);
  });

  it('leaves the rest of the spawn intact (class, shields, phaser)', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 })!;
    expect(state.shpclass).toBe(DROID_CLASS_TRANSPORT);
    expect(state.phasrtype).toBe(5);
    expect(state.shieldtype).toBe(2);
    expect(state.damage).toBe(0);
  });
});
