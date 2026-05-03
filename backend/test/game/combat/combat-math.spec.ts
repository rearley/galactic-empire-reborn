import {
  cdistance,
  damstr,
  decoyIntercept,
  jammerCounter,
  lineOfFire,
  mineFalloff,
  phaserDamage,
  randamage,
  shieldhit,
  tonFact,
} from '../../../src/game/combat/combat-math';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { MINEDAMMAX, MINERANGE, PHABIAS, SHHITENG } from '../../../src/game/constants';

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

  describe('lineOfFire — @see GEFUNCS.C:firephas', () => {
    const firer = { xcoord: 0, ycoord: 0 };

    it('hits a target directly north (heading 0)', () => {
      expect(lineOfFire(firer, { xcoord: 0, ycoord: 100 }, 0, 4)).toBe(true);
    });

    it('hits a target directly east (heading 90)', () => {
      expect(lineOfFire(firer, { xcoord: 100, ycoord: 0 }, 90, 4)).toBe(true);
    });

    it('misses a target outside the arc', () => {
      // target due east, firing north, narrow arc
      expect(lineOfFire(firer, { xcoord: 100, ycoord: 0 }, 0, 4)).toBe(false);
    });

    it('returns false when firer and victim are coincident', () => {
      expect(lineOfFire(firer, { xcoord: 0, ycoord: 0 }, 0, 10)).toBe(false);
    });

    it('PHABIAS extends arc — target just outside `percent` falls inside `percent + PHABIAS`', () => {
      // Place a target at exactly 4.5° bearing from firer.
      const rad = (4.5 * Math.PI) / 180;
      const target = { xcoord: 100 * Math.sin(rad), ycoord: 100 * Math.cos(rad) };
      // arc width 6 → halfWidth (6+PHABIAS)/2 = 4 → 4.5° outside
      expect(lineOfFire(firer, target, 0, 6)).toBe(false);
      // arc width 8 → halfWidth (8+PHABIAS)/2 = 5 → 4.5° inside (PHABIAS pushes it in)
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

  describe('shieldhit — @see GEFUNCS.C:shieldhit', () => {
    it('passes full damage to hull when shields down', () => {
      const r = shieldhit(10000, 50, false);
      expect(r.hullDamage).toBe(50);
      expect(r.shieldDamage).toBe(0);
      expect(r.newShield).toBe(10000);
    });

    it('passes full damage to hull when shield is 0', () => {
      const r = shieldhit(0, 50, true);
      expect(r.hullDamage).toBe(50);
      expect(r.shieldDamage).toBe(0);
    });

    it('absorbs damage through shields', () => {
      const r = shieldhit(SHHITENG * 100, 30, true);
      expect(r.shieldDamage).toBe(30);
      expect(r.hullDamage).toBe(0);
      expect(r.newShield).toBe(SHHITENG * 100 - 30 * SHHITENG);
    });

    it('partial absorb when shield is depleted mid-hit', () => {
      const r = shieldhit(SHHITENG * 5, 10, true);
      // shield can absorb 5 points (5 * SHHITENG energy = full shield), 5 remain to hull
      expect(r.shieldDamage).toBe(5);
      expect(r.hullDamage).toBe(5);
      expect(r.newShield).toBe(0);
    });
  });

  describe('randamage — @see GEFUNCS.C:randamage', () => {
    it('produces deterministic values with a seeded PRNG', () => {
      const r1 = new Mulberry32Adapter(42);
      const r2 = new Mulberry32Adapter(42);
      expect(randamage(r1, 200, 5000)).toBe(randamage(r2, 200, 5000));
    });

    it('respects tonnage scaling — bigger ship deals more damage', () => {
      // Use a fixed-output stub so only the tonnage factor varies.
      const stub = { next: () => 0.5 };
      expect(randamage(stub, 200, 1000)).toBeLessThan(randamage(stub, 200, 10000));
    });

    it('returns 0 when rand returns 0', () => {
      const stub = { next: () => 0 };
      expect(randamage(stub, 200, 5000)).toBe(0);
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
