/**
 * T025 — Lydorian Garbage Scow (class 31) behavior matrix.
 *
 * @see specs/008-droid-ai/tasks.md T025
 * @see GEDROIDS.C:253-298 droid_act_class_10
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { droidActClass10 } from '../../../src/game/droid/droid-act-class-10';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { GESTAT_USER } from '../../../src/game/constants';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState>): ShipState {
  return baseMakeShip({
    userid: 'test-1',
    shipname: 'Test',
    shpclass: 31,
    energy: 50000,
    phasr: 100,
    phasrtype: 5,
    lastfired: -1,
    shieldtype: 2,
    shield: 2,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    freq: [],
    items: new Array(14).fill(0n),
    status: 2,
    cybmine: 255,
    tick: 6,
    topspeed: 8,
    ...overrides,
  });
}

const SCAN_RANGE = 25_000;
const noop = (_: string, __: unknown) => 'MSG';

describe('T025 — Garbage Scow (class 31) behavior matrix', () => {
  describe('jammed behavior', () => {
    it('sets jammedSpeed=999.9 and jammedHoldcourse ∈ [10, 59] when jammer > 0', () => {
      const droid = makeShip({ jammer: 1, speed: 0 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass10(droid, [], SCAN_RANGE, noop, rng);

      expect(action.jammedSpeed).toBe(999.9);
      expect(action.jammedHoldcourse).toBeGreaterThanOrEqual(10);
      expect(action.jammedHoldcourse).toBeLessThanOrEqual(59);
    });

    it('returns empty annoys when jammed', () => {
      const droid = makeShip({ jammer: 1, speed: 0 });
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 0.5 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass10(droid, [player], SCAN_RANGE, noop, rng);

      expect(action.annoys).toHaveLength(0);
    });

    it('sets shieldCommand=1 (shields up) when jammed at speed 0 (< 1000)', () => {
      const droid = makeShip({ jammer: 1, speed: 0 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass10(droid, [], SCAN_RANGE, noop, rng);

      expect(action.shieldCommand).toBe(1);
    });
  });

  describe('annoy behavior (not jammed)', () => {
    it('adds an annoy entry when player is in scan range and roll succeeds', () => {
      // seed 12: first rng.next() ≈ 0.2882 → floor(0.2882 * 4) = 1 → rollAnnoy succeeds
      const droid = makeShip({ jammer: 0, xcoord: 0, ycoord: 0 });
      // cdistance = sqrt(0.5^2) = 0.5; * 10000 = 5000 < 25000 → in range
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 0.5, ycoord: 0 });
      const rng = new Mulberry32Adapter(12);
      const action = droidActClass10(droid, [player], SCAN_RANGE, noop, rng);

      expect(action.annoys).toHaveLength(1);
      expect(action.annoys[0].target).toBe(player);
    });

    it('returns empty annoys when player is out of scan range', () => {
      const droid = makeShip({ jammer: 0, xcoord: 0, ycoord: 0 });
      // cdistance = sqrt(10^2) = 10; * 10000 = 100000 > 25000 → out of range
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 10, ycoord: 0 });
      const rng = new Mulberry32Adapter(12);
      const action = droidActClass10(droid, [player], SCAN_RANGE, noop, rng);

      expect(action.annoys).toHaveLength(0);
    });

    it('does not annoy a non-player ship (status !== GESTAT_USER)', () => {
      const droid = makeShip({ jammer: 0, xcoord: 0, ycoord: 0 });
      const aiShip = makeShip({ userid: '@Droid-1', shipno: 2, status: 2, xcoord: 0.5 }); // GESTAT_AUTO
      const rng = new Mulberry32Adapter(12);
      const action = droidActClass10(droid, [aiShip], SCAN_RANGE, noop, rng);

      expect(action.annoys).toHaveLength(0);
    });
  });

  describe('shield command (not jammed)', () => {
    it('returns shieldCommand=1 (shields up) when speed < 1000', () => {
      const droid = makeShip({ jammer: 0, speed: 500 });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass10(droid, [], SCAN_RANGE, noop, rng);

      expect(action.shieldCommand).toBe(1);
    });

    it('returns shieldCommand=0 (shields down) when speed >= 1000', () => {
      const droid = makeShip({ jammer: 0, speed: 1000 });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass10(droid, [], SCAN_RANGE, noop, rng);

      expect(action.shieldCommand).toBe(0);
    });
  });

  describe('no phasor fire', () => {
    it('never returns a fightback property (Scow does not fight back)', () => {
      const droid = makeShip({ jammer: 0, cantexit: 1, lastfired: 2 });
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 0.5 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass10(droid, [player], SCAN_RANGE, noop, rng);

      expect((action as unknown as Record<string, unknown>)['fightback']).toBeUndefined();
    });
  });
});
