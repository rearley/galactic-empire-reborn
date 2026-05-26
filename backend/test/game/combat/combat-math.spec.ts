import {
  cdistance,
  damstr,
  decoyIntercept,
  inScanRange,
  jammerCounter,
  lineOfFire,
  mineFalloff,
  phaserDamage,
  rollHullDamage,
  shieldhit,
  tonFact,
} from '../../../src/game/combat/combat-math';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { MINEDAMMAX, MINERANGE, PHABIAS, SHIELD_FACTOR, SHMINCHG } from '../../../src/game/constants';

describe('combat-math', () => {
  describe('cdistance — @see GEFUNCS.C:cdistance', () => {
    it('returns 0 for identical points', () => {
      expect(cdistance({ xcoord: 1, ycoord: 1 }, { xcoord: 1, ycoord: 1 })).toBe(0);
    });

    it('computes Euclidean distance', () => {
      expect(cdistance({ xcoord: 0, ycoord: 0 }, { xcoord: 3, ycoord: 4 })).toBe(5);
    });

    it('is symmetric', () => {
      const a = { xcoord: 1, ycoord: 2 };
      const b = { xcoord: 4, ycoord: 6 };
      expect(cdistance(a, b)).toBe(cdistance(b, a));
    });
  });

  describe('inScanRange — bridges sector-unit cdistance to raw-unit scanRange', () => {
    const a = { xcoord: 5, ycoord: 5 };
    it('true at 1 sector with scanRange=15_000 (Interceptor)', () => {
      expect(inScanRange(a, { xcoord: 6, ycoord: 5 }, 15_000)).toBe(true);
    });
    it('false at 2 sectors with scanRange=15_000', () => {
      expect(inScanRange(a, { xcoord: 7, ycoord: 5 }, 15_000)).toBe(false);
    });
    it('true at exact boundary (cdistance × 10_000 === scanRange)', () => {
      expect(inScanRange(a, { xcoord: 6.5, ycoord: 5 }, 15_000)).toBe(true);
    });
    it('false for any non-coincident target when scanRange === 0 (no-scanner sentinel)', () => {
      expect(inScanRange(a, { xcoord: 6, ycoord: 5 }, 0)).toBe(false);
    });
    it('throws when scanRange looks like sector-units (typo guard)', () => {
      expect(() => inScanRange(a, { xcoord: 6, ycoord: 5 }, 1.5)).toThrow(/sector-units/);
      expect(() => inScanRange(a, { xcoord: 6, ycoord: 5 }, 999)).toThrow(/sector-units/);
    });
  });

  describe('lineOfFire — @see GECMDS.C:firep (bearing relative to firer heading)', () => {
    // Coordinate system: y decreases going north (matches physics tick: ycoord -= cos(heading)).
    // bearing is relative to firer.heading: 0 = straight ahead, 90 = starboard.
    const firer = { xcoord: 0, ycoord: 0, heading: 0 }; // facing north

    it('hits a target directly ahead (bearing 0, heading north → target at y<0)', () => {
      expect(lineOfFire(firer, { xcoord: 0, ycoord: -100 }, 0, 4)).toBe(true);
    });

    it('hits a target at relative bearing 90 (east, heading north)', () => {
      expect(lineOfFire(firer, { xcoord: 100, ycoord: 0 }, 90, 4)).toBe(true);
    });

    it('misses a target outside the arc', () => {
      // target due east (absolute), firer heading north, bearing 0 = north — east is 90° off
      expect(lineOfFire(firer, { xcoord: 100, ycoord: 0 }, 0, 4)).toBe(false);
    });

    it('returns false when firer and victim are coincident', () => {
      expect(lineOfFire(firer, { xcoord: 0, ycoord: 0 }, 0, 10)).toBe(false);
    });

    it('bearing is relative — rotating heading changes what you hit', () => {
      const eastFirer = { xcoord: 0, ycoord: 0, heading: 90 }; // facing east
      // Target is north (y<0). With heading 90, north is at relative bearing 270.
      expect(lineOfFire(eastFirer, { xcoord: 0, ycoord: -100 }, 270, 4)).toBe(true);
      // Bearing 0 when heading east hits eastward target, not northern target.
      expect(lineOfFire(eastFirer, { xcoord: 0, ycoord: -100 }, 0, 4)).toBe(false);
    });

    it('PHABIAS extends arc — target just outside `percent` falls inside `percent + PHABIAS`', () => {
      // Target 4.5° starboard of north (firer heading 0, bearing 0).
      // North is y decreasing; 4.5° east of north: x=sin(4.5°)>0, y=-cos(4.5°)<0
      const rad = (4.5 * Math.PI) / 180;
      const target = { xcoord: 100 * Math.sin(rad), ycoord: -100 * Math.cos(rad) };
      // arc width 6 → halfWidth (6+PHABIAS)/2 = 4 → 4.5° outside → MISS
      expect(lineOfFire(firer, target, 0, 6)).toBe(false);
      // arc width 8 → halfWidth (8+PHABIAS)/2 = 5 → 4.5° inside → HIT
      expect(lineOfFire(firer, target, 0, 8)).toBe(true);
      expect(PHABIAS).toBe(2);
    });
  });

  describe('phaserDamage — @see GEFUNCS.C:firephas', () => {
    it('returns 0 at percent 0', () => {
      expect(phaserDamage(0, 10, 1000)).toBe(0);
    });

    it('falls off with range', () => {
      const close = phaserDamage(100, 0, 1000);
      const far = phaserDamage(100, 1000, 1000);
      expect(close).toBeGreaterThan(far);
    });

    it('matches formula at zero range', () => {
      expect(phaserDamage(50, 0, 1000)).toBe(500);
    });
  });

  describe('tonFact — @see GEFUNCS.C:ton_fact', () => {
    it('clamps to 0.1 floor for tiny tonnage', () => {
      expect(tonFact(0)).toBe(0.1);
      expect(tonFact(500)).toBe(0.1);
    });

    it('clamps to 1.0 ceiling for huge tonnage', () => {
      expect(tonFact(50000)).toBe(1.0);
    });

    it('scales linearly inside the band', () => {
      expect(tonFact(5000)).toBeCloseTo(0.5);
    });
  });

  describe('shieldhit — @see GEFUNCS.C:2430 shieldhit', () => {
    // dmax = 80 - shieldtype * SHIELD_FACTOR; knock = floor(dmax * damage/100)
    // Hull always 0 (shields absorb everything); knockedDown when newCharge < SHMINCHG.

    it('type-1 shield absorbs 76% of incoming damage', () => {
      // dmax = 80 - 1*4 = 76; knock = floor(76*100/100) = 76; newCharge = 200-76 = 124
      const r = shieldhit(200, 1, 100);
      expect(r.hullDamage).toBe(0);
      expect(r.shieldConsumed).toBe(76);
      expect(r.newCharge).toBe(124);
      expect(r.knockedDown).toBe(false);
      expect(SHIELD_FACTOR).toBe(4);
    });

    it('type-5 shield absorbs 60% of incoming damage', () => {
      // dmax = 80 - 5*4 = 60; knock = floor(60*50/100) = 30; newCharge = 200-30 = 170
      const r = shieldhit(200, 5, 50);
      expect(r.hullDamage).toBe(0);
      expect(r.shieldConsumed).toBe(30);
      expect(r.newCharge).toBe(170);
      expect(r.knockedDown).toBe(false);
    });

    it('type-20 shield is impenetrable — no charge drain', () => {
      // dmax = 0 for type 20; knock = 0; charge unchanged
      const r = shieldhit(100, 20, 999);
      expect(r.hullDamage).toBe(0);
      expect(r.shieldConsumed).toBe(0);
      expect(r.newCharge).toBe(100);
      expect(r.knockedDown).toBe(false);
    });

    it('knocks shield down when newCharge falls below SHMINCHG', () => {
      // Type 1, dmax=76; with charge=10 and damage=100: knock=76, newCharge=10-76=-66
      const r = shieldhit(10, 1, 100);
      expect(r.knockedDown).toBe(true);
      expect(SHMINCHG).toBe(5);
    });
  });

  describe('rollHullDamage — projectile hull damage roll', () => {
    it('produces deterministic values with a seeded PRNG', () => {
      const r1 = new Mulberry32Adapter(42);
      const r2 = new Mulberry32Adapter(42);
      expect(rollHullDamage(r1, 200, 5000)).toBe(rollHullDamage(r2, 200, 5000));
    });

    it('respects tonnage scaling — bigger ship deals more damage', () => {
      const stub = { next: () => 0.5 };
      expect(rollHullDamage(stub, 200, 1000)).toBeLessThan(rollHullDamage(stub, 200, 10000));
    });

    it('returns 0 when rand returns 0', () => {
      const stub = { next: () => 0 };
      expect(rollHullDamage(stub, 200, 5000)).toBe(0);
    });
  });

  describe('mineFalloff — @see GEFUNCS.C:minesweep', () => {
    it('returns 0 at or beyond MINERANGE', () => {
      expect(mineFalloff(MINERANGE, 5000)).toBe(0);
      expect(mineFalloff(MINERANGE * 2, 5000)).toBe(0);
    });

    it('peaks at distance 0', () => {
      expect(mineFalloff(0, 10000)).toBeGreaterThan(0);
    });

    it('cubic falloff — half-distance damage is 1/8 of full (scaled by tonFact)', () => {
      const close = mineFalloff(0, 10000);
      const half = mineFalloff(MINERANGE / 2, 10000);
      // half / close should approximate 0.125 (cube of 0.5)
      expect(half / close).toBeCloseTo(0.125, 1);
    });

    it('caps at MINEDAMMAX scaled by tonFact', () => {
      expect(mineFalloff(0, 10000)).toBeLessThanOrEqual(MINEDAMMAX);
    });
  });

  describe('decoyIntercept — @see GECMDS.C:cmd_decoy', () => {
    it('returns true when roll falls below threshold', () => {
      const stub = { next: () => 0.1 }; // 10 < 50
      expect(decoyIntercept(stub, 50)).toBe(true);
    });

    it('returns false when roll is above threshold', () => {
      const stub = { next: () => 0.9 }; // 90 > 50
      expect(decoyIntercept(stub, 50)).toBe(false);
    });

    it('is deterministic with seeded PRNG', () => {
      const a = new Mulberry32Adapter(7);
      const b = new Mulberry32Adapter(7);
      expect(decoyIntercept(a, 50)).toBe(decoyIntercept(b, 50));
    });
  });

  describe('jammerCounter — @see GECMDS.C:cmd_jammer 1593-1651', () => {
    it('returns 0 when target is outside scan range', () => {
      expect(jammerCounter(1000, 500, 20)).toBe(0);
    });

    it('returns full jamtime at distance 0', () => {
      expect(jammerCounter(0, 1000, 20)).toBe(20);
    });

    it('decays linearly with distance', () => {
      expect(jammerCounter(500, 1000, 20)).toBe(10);
    });
  });

  describe('damstr — @see GEFUNCS.C:damstr', () => {
    it('returns "Undamaged" below 10%', () => {
      expect(damstr(0)).toBe('Undamaged');
      expect(damstr(9)).toBe('Undamaged');
    });

    it('returns "Light" at 10-24%', () => {
      expect(damstr(10)).toBe('Light');
      expect(damstr(24)).toBe('Light');
    });

    it('returns "Moderate" at 25-49%', () => {
      expect(damstr(25)).toBe('Moderate');
    });

    it('returns "Heavy" at 50-74%', () => {
      expect(damstr(50)).toBe('Heavy');
    });

    it('returns "Critical" at 75-89%', () => {
      expect(damstr(75)).toBe('Critical');
    });

    it('returns "Destroyed" at 90%+', () => {
      expect(damstr(90)).toBe('Destroyed');
      expect(damstr(100)).toBe('Destroyed');
    });
  });
});
