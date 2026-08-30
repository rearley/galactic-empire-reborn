import {
  DECODDS, DECOYTIME, FIRETICKS, HPBEAMW, JAMTIME, MAXMISSL, MAXTORPS,
  MDAMMAX, MINEDAMMAX, MINERANGE, MISENGFC, MISLSPED, PHABIAS, PMINFIRE,
  PRELOAD, SHHITENG, TDAMMAX, TORPSPED,
} from '../../../src/game/constants';
import { lineOfFire } from '../../../src/game/combat/combat-math';
import { MineRegistry } from '../../../src/game/combat/mine.registry';

/**
 * Balance-regression — every combat constant defined in T004 has a guard test
 * that fails if the value is changed without explicit intent. Mirrors the
 * 006a/physics-tick balance-regression suite.
 *
 * @see CLAUDE.md "Balance regression tests"
 * @see GEMAIN.H combat constants
 */
describe('combat balance regression', () => {
  it('PMINFIRE === 60', () => expect(PMINFIRE).toBe(60));
  it('PRELOAD === 10', () => expect(PRELOAD).toBe(10));
  it('PHABIAS === 2', () => expect(PHABIAS).toBe(2));
  it('SHHITENG === 1000', () => expect(SHHITENG).toBe(1000));
  it('FIRETICKS === 10', () => expect(FIRETICKS).toBe(10));
  it('DECOYTIME === 15', () => expect(DECOYTIME).toBe(15));
  it('HPBEAMW === 5', () => expect(HPBEAMW).toBe(5));
  it('MAXTORPS === 3', () => expect(MAXTORPS).toBe(3));
  it('MAXMISSL === 3', () => expect(MAXMISSL).toBe(3));
  it('MINERANGE === 10000', () => expect(MINERANGE).toBe(10000));
  // numopt CLAMPS both of these to 1..100 (GEMAIN.C:508, 511). The previous
  // pins of 200/300 encoded values the original cannot produce.
  // @see test/balance/projectile-dammax.balance.spec.ts
  it('TDAMMAX === 100 (numopt ceiling)', () => expect(TDAMMAX).toBe(100));
  it('MDAMMAX === 100 (numopt ceiling)', () => expect(MDAMMAX).toBe(100));
  it('MINEDAMMAX === 150', () => expect(MINEDAMMAX).toBe(150));
    // decoyIntercept now uses the C 1-in-N form (GEFUNCS.C:1585) instead of a
  // 0-100 percentage, so decodds is a divisor: 2 reproduces the old 50%.
  it('DECODDS === 2 (1-in-2 = the former 50%)', () => expect(DECODDS).toBe(2));
  it('TORPSPED === 500', () => expect(TORPSPED).toBe(500));
  it('MISLSPED === 300', () => expect(MISLSPED).toBe(300));
  it('MISENGFC === 10', () => expect(MISENGFC).toBe(10));
  // numopt CLAMPS jamtime to 1..10 (GEMAIN.C:496); the previous pin of 20
  // encoded a value the original cannot produce.
  // @see test/balance/jamtime.balance.spec.ts
  it('JAMTIME === 10 (numopt ceiling)', () => expect(JAMTIME).toBe(10));

  describe('mine sweep cadence — `timer % 5 === 0`', () => {
    it('returns mines whose timer ∈ {0, 5, 10} but excludes {1, 2, 3, 4}', () => {
      const reg = new MineRegistry();
      reg.hydrate([
        { id: 0, channel: 1, timer: 0, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 1, channel: 1, timer: 1, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 2, channel: 1, timer: 2, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 3, channel: 1, timer: 3, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 4, channel: 1, timer: 4, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 5, channel: 1, timer: 5, xcoord: 0, ycoord: 0, deployedBy: 'u' },
        { id: 10, channel: 1, timer: 10, xcoord: 0, ycoord: 0, deployedBy: 'u' },
      ]);
      const ids = reg.sweepCandidates().map((m) => m.id).sort((a, b) => a - b);
      expect(ids).toEqual([0, 5, 10]);
    });
  });

  describe('PHABIAS — extends arc width', () => {
    it('target outside `percent` arc but within `percent + PHABIAS` resolves as hit', () => {
      // Firer heading north (heading=0). Bearing 0 = straight ahead = north.
      // y decreases northward; 4.5° starboard of north: x=sin(4.5°)>0, y=-cos(4.5°)<0
      const firer = { xcoord: 0, ycoord: 0, heading: 0 };
      const rad = (4.5 * Math.PI) / 180;
      const target = { xcoord: 100 * Math.sin(rad), ycoord: -100 * Math.cos(rad) };
      // Beam half-angle is `focus + PHABIAS` (PHABIAS=2). degree is relative to heading.
      // focus 2 → halfWidth = 2+2 = 4° → 4.5° just outside → MISS
      expect(lineOfFire(firer, target, 0, 2)).toBe(false);
      // focus 3 → halfWidth = 3+2 = 5° → 4.5° inside → HIT (PHABIAS widened the arc)
      expect(lineOfFire(firer, target, 0, 3)).toBe(true);
    });
  });
});
