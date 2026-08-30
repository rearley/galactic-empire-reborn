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
    findAllShips: () => [],
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

  it('leaves the rest of the spawn intact (class, shields, phaser)', () => {
    const { spawner } = buildSpawner(42);
    const state = spawner.spawn(DROID_CLASS_TRANSPORT, new Map(), { x: 1, y: 2 })!;
    expect(state.shpclass).toBe(DROID_CLASS_TRANSPORT);
    expect(state.phasrtype).toBe(5);
    expect(state.shieldtype).toBe(2);
    expect(state.damage).toBe(0);
  });
});
