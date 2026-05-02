import {
  accelerationStep,
  normalizeHeading,
  positionIntegration,
  rotationStep,
  sectorOf,
  tryEnergyDebit,
} from '../../../src/game/physics/physics-math';
import { ACCENGAMT, COORD_SCALE, WARP_THRESHOLD } from '../../../src/game/constants';

describe('physics-math', () => {
  describe('accelerationStep', () => {
    it('steps up by maxAccel toward target', () => {
      const r = accelerationStep(0, 5000, 1000);
      expect(r.newSpeed).toBe(1000);
    });

    it('steps down by 2*maxAccel toward target', () => {
      const r = accelerationStep(5000, 0, 1000);
      expect(r.newSpeed).toBe(3000);
    });

    it('snaps when gap is within step (up)', () => {
      const r = accelerationStep(900, 1000, 200);
      expect(r.newSpeed).toBe(1000);
    });

    it('snaps when gap is within step (down)', () => {
      const r = accelerationStep(1000, 900, 100); // 2*100=200 ≥ 100
      expect(r.newSpeed).toBe(900);
    });

    it('returns no debit when post-step speed is below warp threshold', () => {
      const r = accelerationStep(0, 500, 100);
      expect(r.newSpeed).toBe(100);
      expect(r.newSpeed).toBeLessThan(WARP_THRESHOLD);
      expect(r.energyDebit).toBe(0);
    });

    it('returns ACCENGAMT debit when post-step speed is at/above warp threshold', () => {
      const r = accelerationStep(0, 1000, 1000);
      expect(r.newSpeed).toBe(1000);
      expect(r.energyDebit).toBe(ACCENGAMT);
    });

    it('emits hyperspace=enter when crossing 999 → ≥1000', () => {
      const r = accelerationStep(0, 2000, 1000);
      expect(r.hyperspaceEvent).toBe('enter');
    });

    it('emits hyperspace=exit when crossing ≥1000 → <1000', () => {
      const r = accelerationStep(1000, 0, 1000); // step = 2000 → snap to 0
      expect(r.hyperspaceEvent).toBe('exit');
    });

    it('no hyperspace event when staying below threshold', () => {
      const r = accelerationStep(100, 500, 100);
      expect(r.hyperspaceEvent).toBeNull();
    });

    it('no hyperspace event when staying at/above threshold', () => {
      const r = accelerationStep(2000, 5000, 1000);
      expect(r.hyperspaceEvent).toBeNull();
    });

    it('no-op when speed already equals target', () => {
      const r = accelerationStep(1000, 1000, 500);
      expect(r.newSpeed).toBe(1000);
      expect(r.energyDebit).toBe(0);
      expect(r.hyperspaceEvent).toBeNull();
    });
  });

  describe('positionIntegration', () => {
    it('heading 90 advances +x by speed/COORD_SCALE', () => {
      const r = positionIntegration(5, 5, 90, 1000);
      expect(r.x).toBeCloseTo(5 + 1000 / COORD_SCALE, 10);
      expect(r.y).toBeCloseTo(5, 10);
    });

    it('heading 0 advances -y by speed/COORD_SCALE', () => {
      const r = positionIntegration(5, 5, 0, 1000);
      expect(r.x).toBeCloseTo(5, 10);
      expect(r.y).toBeCloseTo(5 - 1000 / COORD_SCALE, 10);
    });

    it('heading 180 advances +y by speed/COORD_SCALE', () => {
      const r = positionIntegration(5, 5, 180, 1000);
      expect(r.x).toBeCloseTo(5, 10);
      expect(r.y).toBeCloseTo(5 + 1000 / COORD_SCALE, 10);
    });

    it('heading 270 advances -x by speed/COORD_SCALE', () => {
      const r = positionIntegration(5, 5, 270, 1000);
      expect(r.x).toBeCloseTo(5 - 1000 / COORD_SCALE, 10);
      expect(r.y).toBeCloseTo(5, 10);
    });

    it('heading 45 advances both x+ and y- by sin/cos components', () => {
      const r = positionIntegration(5, 5, 45, 65000);
      const expected = Math.sin((45 * Math.PI) / 180);
      expect(r.x - 5).toBeCloseTo(expected, 10);
      expect(5 - r.y).toBeCloseTo(expected, 10);
    });

    it('speed 0 is a no-op', () => {
      const r = positionIntegration(5.5, 7.25, 90, 0);
      expect(r.x).toBe(5.5);
      expect(r.y).toBe(7.25);
    });
  });

  describe('tryEnergyDebit', () => {
    it('refuses when energy - amount < floor', () => {
      const r = tryEnergyDebit(1000, 500, 600);
      expect(r.ok).toBe(false);
    });

    it('accepts when energy - amount >= floor', () => {
      const r = tryEnergyDebit(1000, 400, 500);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.newEnergy).toBe(600);
    });

    it('zero amount is a no-op accept', () => {
      const r = tryEnergyDebit(100, 0, 50);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.newEnergy).toBe(100);
    });
  });

  describe('sectorOf', () => {
    it('returns floor of coordinates', () => {
      expect(sectorOf({ x: 9.95, y: 5.0 })).toEqual({ x: 9, y: 5 });
      expect(sectorOf({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
      expect(sectorOf({ x: 29.999, y: 14.999 })).toEqual({ x: 29, y: 14 });
    });
  });

  describe('rotationStep', () => {
    it('advances by max_accel/10 toward target the short way', () => {
      const r = rotationStep(0, 90, 200); // step 20
      expect(r.newHeading).toBe(20);
      expect(r.snapped).toBe(false);
    });

    it('snaps when gap within step', () => {
      const r = rotationStep(85, 90, 200); // step 20, gap 5
      expect(r.newHeading).toBe(90);
      expect(r.snapped).toBe(true);
    });

    it('rotates 350 → 10 the short way (one step crosses boundary)', () => {
      const r = rotationStep(350, 10, 200); // step 20, short gap = 20
      expect(r.newHeading).toBe(10);
      expect(r.snapped).toBe(true);
    });

    it('rotates 350 → 90 going the +ve direction (gap 100, short)', () => {
      const r = rotationStep(350, 90, 200); // step 20, short = 100, advance +20
      expect(r.newHeading).toBe(10);
      expect(r.snapped).toBe(false);
    });

    it('no-op when already on target', () => {
      const r = rotationStep(180, 180, 200);
      expect(r.newHeading).toBe(180);
      expect(r.snapped).toBe(true);
    });

    it('result is normalized to [0, 360)', () => {
      const r = rotationStep(355, 5, 100); // step 10, short gap 10 → snap to 5
      expect(r.newHeading).toBeGreaterThanOrEqual(0);
      expect(r.newHeading).toBeLessThan(360);
      expect(r.newHeading).toBe(5);
    });
  });

  describe('normalizeHeading', () => {
    it('-10 → 350', () => expect(normalizeHeading(-10)).toBe(350));
    it('370 → 10', () => expect(normalizeHeading(370)).toBe(10));
    it('360 → 0', () => expect(normalizeHeading(360)).toBe(0));
    it('0 → 0', () => expect(normalizeHeading(0)).toBe(0));
    it('359.5 → 359.5', () => expect(normalizeHeading(359.5)).toBe(359.5));
  });
});
