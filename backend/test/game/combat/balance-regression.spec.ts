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
  // SYSOP OPTIONS ARE NOT PINNED HERE. TDAMMAX, MDAMMAX, MINEDAMMAX, DECODDS,
  // TORPSPED, MISLSPED, MISENGFC and JAMTIME are all runtime options, and
  // their defaults belong to the file that checks them against the original
  // option database:
  //   @see test/balance/sysop-options-canon.balance.spec.ts
  //
  // They were pinned here to 100/100/150/2/500/300/10/10, and the comments
  // that justified those numbers show how it happened: an earlier pass found
  // pins of 200 and 300 for TDAMMAX/MDAMMAX, recognised that numopt could
  // never produce them, and moved them to the CEILING of the clamp. But the
  // ceiling is not the shipped value either -- MBMGEMSG.MSG ships TDAMMAX 35
  // and MDAMMAX 25. Pinning a bound looks rigorous and asserts nothing about
  // what the game actually shipped, so this file now keeps only the fixed
  // #define constants above, which are genuinely immutable design values.

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
