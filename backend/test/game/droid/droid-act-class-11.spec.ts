/**
 * T026 — Murdonian Transport (class 32) behavior matrix.
 *
 * @see specs/008-droid-ai/tasks.md T026
 * @see GEDROIDS.C:302-404 droid_act_class_11
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { droidActClass11 } from '../../../src/game/droid/droid-act-class-11';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { GESTAT_USER, PMINFIRE } from '../../../src/game/constants';

function makeShip(overrides: Partial<ShipState>): ShipState {
  return {
    userid: 'test-1', shipno: 1, shipname: 'Test', shpclass: 32,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 5, kills: 0, lastfired: -1,
    shieldtype: 2, shieldstat: 0, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [], items: new Array(14).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 2, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 6, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

const SCAN_RANGE = 25_000;
const CONFUSE_DENOM = 10;
const noop = (_: string, __: unknown) => 'MSG';

describe('T026 — Murdonian Transport (class 32) behavior matrix', () => {
  describe('jammed behavior', () => {
    it('sets jammedFlee.speed2b = topspeed * 1000 when jammer > 0', () => {
      const droid = makeShip({ jammer: 1, topspeed: 8 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.jammedFlee).toBeDefined();
      expect(action.jammedFlee!.speed2b).toBe(8 * 1000);
    });

    it('sets jammedFlee.holdcourse ∈ [10, 59] when jammed', () => {
      const droid = makeShip({ jammer: 1, topspeed: 8 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.jammedFlee!.holdcourse).toBeGreaterThanOrEqual(10);
      expect(action.jammedFlee!.holdcourse).toBeLessThanOrEqual(59);
    });

    it('returns empty passiveAnnoys when jammed', () => {
      const droid = makeShip({ jammer: 1 });
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 0.5 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [player], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.passiveAnnoys).toHaveLength(0);
    });
  });

  describe('passive annoy (not jammed, player in range)', () => {
    it('may push a passiveAnnoy when player is in scan range (roll-based)', () => {
      // seed 12: first rng.next() ≈ 0.2882 → floor(0.2882 * 4) = 1 → rollAnnoy succeeds
      const droid = makeShip({ jammer: 0, holdcourse: 0, xcoord: 0 });
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, xcoord: 0.5 });
      const rng = new Mulberry32Adapter(12);
      const action = droidActClass11(droid, [player], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.passiveAnnoys).toHaveLength(1);
      expect(action.passiveAnnoys[0].target).toBe(player);
    });
  });

  describe('fightback: lastfired >= 0 threshold', () => {
    it('triggers fightback when cantexit > 0 and lastfired = 0 (>= 0 condition)', () => {
      // lastfired=0 means droid.lastfired >= 0 is true; attacker shipno must match
      const attacker = makeShip({ userid: 'player-1', shipno: 0, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 0, // 0 qualifies under >=
        phasr: PMINFIRE, where: 0, xcoord: 0, holdcourse: 0,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback).toBeDefined();
      expect(action.fightback!.target).toBe(attacker);
    });

    it('does NOT trigger fightback when lastfired = -1 (cantexit=0)', () => {
      const player = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER });
      const droid = makeShip({ jammer: 0, cantexit: 0, lastfired: -1 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [player], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback).toBeUndefined();
    });

    it('triggers fightback when cantexit > 0 and lastfired >= 0 (positive case)', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 5, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 5,
        phasr: PMINFIRE, where: 0, holdcourse: 0,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback).toBeDefined();
    });
  });

  describe('fightback: fire mode', () => {
    it('sets fireMode=normal when both in normal space and phasr >= PMINFIRE, attacker not cloaked', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback!.fireMode).toBe('normal');
    });

    it('sets fireMode=hyper when both in hyperspace and ddist < 30000', () => {
      // Place both at same location so ddist ≈ 0
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 1, xcoord: 0, ycoord: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        where: 1, xcoord: 0, ycoord: 0,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback!.fireMode).toBe('hyper');
    });

    it('sets hypEvade when in hyperspace with missiles attached', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 1 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        where: 1, xcoord: 0, ycoord: 0,
        lmisslDistance: [100, 0, 0], // missile attached
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback!.hypEvade).toBeDefined();
    });
  });

  describe('confuse heading (1-in-10 roll)', () => {
    it('sets fightback.confuse with holdcourse ∈ [3, 12] when roll triggers', () => {
      // seed 1 trace: v0 (helpMsg) ≈ 0.6271, v1 (confuse check) ≈ 0.0027 → floor(0.0027*10)=0 ✓
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, holdcourse: 0,
      });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback!.confuse).toBeDefined();
      expect(action.fightback!.confuse!.holdcourse).toBeGreaterThanOrEqual(3);
      expect(action.fightback!.confuse!.holdcourse).toBeLessThanOrEqual(12);
    });

    it('does NOT set confuse when holdcourse > 0 (already on hold)', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, holdcourse: 5, // non-zero — skips confuse check
      });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass11(droid, [attacker], SCAN_RANGE, CONFUSE_DENOM, noop, noop, rng);

      expect(action.fightback!.confuse).toBeUndefined();
    });
  });
});
