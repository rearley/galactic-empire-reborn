import { rollDroidSpawnCoord } from '../../src/game/droid/droid-spawn-coord';

/**
 * Droids were scattered over ±19.8 sectors in a galaxy that is ±10, so roughly
 * half of every spawn landed outside the universe and was wrapped on its first
 * move — a 20-sector teleport. It also meant the Murdonian Transport, the
 * designated starter target, was usually nowhere a new pilot could reach.
 *
 * C branches on the universe size (GEDROIDS.C:131-140):
 *
 *   if (univmax < 20) {
 *       xcoord = rndm(univmax*2.0) - univmax;
 *   } else {
 *       xcoord = rndm(39.9) - 19.8;
 *   }
 *
 * The port implemented only the `else`. With UNIVMAX defaulting to 10, C takes
 * the FIRST branch every time.
 */
describe('rollDroidSpawnCoord', () => {
  const seq = (...vals: number[]) => {
    let i = 0;
    return { next: () => vals[i++ % vals.length] };
  };

  it('stays inside a small universe, as C does when univmax < 20', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const c = rollDroidSpawnCoord(seq(r) as never, 10);
      expect(c).toBeGreaterThanOrEqual(-10);
      expect(c).toBeLessThanOrEqual(10);
    }
  });

  it('spans the full width of that universe', () => {
    expect(rollDroidSpawnCoord(seq(0) as never, 10)).toBeCloseTo(-10, 6);
    expect(rollDroidSpawnCoord(seq(0.5) as never, 10)).toBeCloseTo(0, 6);
  });

  it('uses C\'s fixed ±19.8 spread only for a large universe', () => {
    expect(rollDroidSpawnCoord(seq(0) as never, 20)).toBeCloseTo(-19.8, 6);
    expect(rollDroidSpawnCoord(seq(0) as never, 500)).toBeCloseTo(-19.8, 6);
  });

  it('never places a droid outside the default galaxy', () => {
    for (let i = 0; i <= 100; i++) {
      const c = rollDroidSpawnCoord(seq(i / 100) as never, 10);
      expect(Math.abs(c)).toBeLessThanOrEqual(10);
    }
  });
});
