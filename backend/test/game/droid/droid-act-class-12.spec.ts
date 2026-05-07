/**
 * T027 — Vakory Survey Drone (class 33) behavior matrix.
 *
 * @see specs/008-droid-ai/tasks.md T027
 * @see GEDROIDS.C:410-530 droid_act_class_12
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { droidActClass12 } from '../../../src/game/droid/droid-act-class-12';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { GESTAT_USER, PMINFIRE } from '../../../src/game/constants';

function makeShip(overrides: Partial<ShipState>): ShipState {
  return {
    userid: 'test-1', shipno: 1, shipname: 'Test', shpclass: 33,
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
const ALTER_VECTOR_DENOM = 20;
const DAMAGE_THRESHOLD = 75;
const noop = (_: string, __: unknown) => 'MSG';

describe('T027 — Vakory Survey Drone (class 33) behavior matrix', () => {
  describe('jammed behavior', () => {
    it('sets jammedFlee with speed2b = topspeed * 1000 when jammer > 0', () => {
      const droid = makeShip({ jammer: 1, topspeed: 8 });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.jammedFlee).toBeDefined();
      expect(action.jammedFlee!.speed2b).toBe(8 * 1000);
      expect(action.jammedFlee!.holdcourse).toBeGreaterThanOrEqual(10);
      expect(action.jammedFlee!.holdcourse).toBeLessThanOrEqual(59);
    });
  });

  describe('fightback: lastfired > 0 (strictly greater, unlike class 11)', () => {
    it('does NOT trigger fightback when lastfired = 0 (strict > 0 check)', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 0, status: GESTAT_USER });
      const droid = makeShip({ jammer: 0, cantexit: 1, lastfired: 0 }); // 0 does NOT qualify
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback).toBeUndefined();
    });

    it('triggers fightback when cantexit > 0 and lastfired = 1 (> 0)', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 1, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 1,
        phasr: PMINFIRE, where: 0, damage: 0,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback).toBeDefined();
      expect(action.fightback!.target).toBe(attacker);
    });
  });

  describe('fightback: fire mode and torpedo count', () => {
    it('sets fireMode=normal in normal space when phasr >= PMINFIRE and attacker not cloaked', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0, holdcourse: 0,
      });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.fireMode).toBe('normal');
    });

    it('returns torpCount >= 0 (replenishment is caller responsibility per GEDROIDS.C:480)', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0,
        items: new Array(14).fill(0n), // torpedo inventory = 0; caller replenishes
      });
      const rng = new Mulberry32Adapter(1);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.torpCount).toBeGreaterThanOrEqual(0);
    });

    it('returns torpCount=0 with seed 7 (rollVakoryTorpedoVolley → floor(x*2)=0)', () => {
      // seed 7: v0 (helpMsg) used, v1 = rollVakoryTorpedoVolley → floor(0.0117*2) = 0
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0, holdcourse: 5, // non-zero prevents alterVector check
      });
      const rng = new Mulberry32Adapter(7);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.torpCount).toBe(0);
    });
  });

  describe('damage flee: > damageThreshold with mine and jammer', () => {
    it('sets damageFlee with layMine=true and deployJammer=true when both items present', () => {
      const items = new Array(14).fill(0n);
      items[11] = 5n; // I_MINE
      items[10] = 3n; // I_JAMMER
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0,
        damage: 76, // > 75 threshold
        topspeed: 8, items,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.damageFlee).toBeDefined();
      expect(action.fightback!.damageFlee!.layMine).toBe(true);
      expect(action.fightback!.damageFlee!.deployJammer).toBe(true);
      expect(action.fightback!.damageFlee!.speed2b).toBe(8 * 1000);
    });

    it('does NOT set damageFlee when damage <= threshold', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 50,
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.damageFlee).toBeUndefined();
    });
  });

  describe('missile evade', () => {
    it('sets fightback.missileEvade when lmisslDistance[0] > 0', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0,
        lmisslDistance: [100, 0, 0], // missile attached
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.missileEvade).toBeDefined();
    });

    it('does not set missileEvade when no missiles attached', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0,
        lmisslDistance: [0, 0, 0],
      });
      const rng = new Mulberry32Adapter(42);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.missileEvade).toBeUndefined();
    });
  });

  describe('alter-attack-vector (1-in-20 roll)', () => {
    it('sets fightback.alterVector with holdcourse ∈ [3, 12] when roll triggers', () => {
      // seed 13 trace: v0 (helpMsg), v1 (torpCount, floor*2=0), v2 (alter check, floor(0.0706*20)=1) ✓
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0,
        holdcourse: 0, // required for alterVector check
      });
      const rng = new Mulberry32Adapter(13);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.alterVector).toBeDefined();
      expect(action.fightback!.alterVector!.holdcourse).toBeGreaterThanOrEqual(3);
      expect(action.fightback!.alterVector!.holdcourse).toBeLessThanOrEqual(12);
    });

    it('does NOT set alterVector when holdcourse > 0', () => {
      const attacker = makeShip({ userid: 'player-1', shipno: 2, status: GESTAT_USER, where: 0, cloak: 0 });
      const droid = makeShip({
        jammer: 0, cantexit: 1, lastfired: 2,
        phasr: PMINFIRE, where: 0, damage: 0,
        holdcourse: 5, // non-zero — skips alterVector check
      });
      const rng = new Mulberry32Adapter(13);
      const action = droidActClass12(droid, [attacker], SCAN_RANGE, ALTER_VECTOR_DENOM, DAMAGE_THRESHOLD, noop, noop, rng);

      expect(action.fightback!.alterVector).toBeUndefined();
    });
  });
});
