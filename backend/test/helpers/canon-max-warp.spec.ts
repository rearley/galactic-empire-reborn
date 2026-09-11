import { canonMaxWarp } from './canon-max-warp';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

describe('canonMaxWarp', () => {
  it('returns the class table value, not a transcription', () => {
    for (const c of SHIP_CLASSES) {
      expect(canonMaxWarp(c.classNumber)).toBe(c.maxWarp);
    }
  });

  it('is always a warp factor, inside the domain fixtures are held to', () => {
    for (const c of SHIP_CLASSES) {
      expect(canonMaxWarp(c.classNumber)).toBeGreaterThanOrEqual(0);
      expect(canonMaxWarp(c.classNumber)).toBeLessThanOrEqual(255);
    }
  });

  it('refuses a hull that does not exist', () => {
    expect(() => canonMaxWarp(99)).toThrow(/does not exist/);
  });
});
