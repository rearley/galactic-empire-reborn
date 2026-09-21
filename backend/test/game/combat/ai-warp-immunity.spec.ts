/**
 * A ship in hyperspace is out of reach of anything below a Mark-5 phaser —
 * including an AI's.
 *
 * Canon's firep gates the whole victim loop:
 *
 *     if (ingegame(othusn) && (wptr->where != 1 || ptr->phasrtype >= phatowrp))
 *
 * (GECMDS.C:949, `phatowrp` = 5.) A warping ship is untouchable unless the
 * shooter carries a Mark-5 or better. That gate is what makes "jump to warp to
 * break contact" the fundamental survival move.
 *
 * The player's own handler applies it (phaser.handler.ts). Neither AI path did:
 * both passed `victimAtWarp` into `phaserDamage`, which only HALVES damage, and
 * fired anyway. So any droid or Cybertron, with any phaser, could shoot a
 * player in hyperspace — where shields have collapsed on entry, `sca` is
 * refused, and nothing can be fired back.
 *
 * Round 5 saw a ship destroyed outright in transit that way.
 *
 * Note the gate is on `where == 1`, the hyperspace flag, not on a speed
 * threshold.
 */
import { aiCanHitTarget } from '../../../src/game/combat/combat-math';
import { PHATOWRP } from '../../../src/game/constants';

describe('firep\'s hyperspace gate applies to the AI too', () => {
  it('lets a Mark-5 reach a warping victim, as canon does', () => {
    expect(aiCanHitTarget({ phasrtype: PHATOWRP, targetWhere: 1 })).toBe(true);
  });

  it('refuses a Mark-1 against a warping victim', () => {
    expect(aiCanHitTarget({ phasrtype: 1, targetWhere: 1 })).toBe(false);
  });

  it('refuses a Mark-4 — the boundary, since phatowrp is 5', () => {
    expect(aiCanHitTarget({ phasrtype: PHATOWRP - 1, targetWhere: 1 })).toBe(false);
  });

  it('lets any phaser reach a victim in normal space', () => {
    expect(aiCanHitTarget({ phasrtype: 1, targetWhere: 0 })).toBe(true);
  });

  it('gates on the hyperspace flag, not on speed', () => {
    // `where` is what canon reads. A ship can carry warp-class speed for a tick
    // before the flag flips, and vice versa on the way out.
    expect(aiCanHitTarget({ phasrtype: 1, targetWhere: 0 })).toBe(true);
    expect(aiCanHitTarget({ phasrtype: 1, targetWhere: 1 })).toBe(false);
  });
});

/**
 * The gate has to be CALLED, not merely available.
 *
 * Two fixes this week shipped as correct helpers with no production caller —
 * the missile shake and the CLOK3 ion trail — so the wiring is asserted, not
 * assumed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('both AI fire paths are gated', () => {
  /**
   * Neither AI calls the helper by name any more. Both fire through AiWeapons —
   * canon's own firep, which both GECYBS.C and GEDROIDS.C call — and its phaser
   * goes through the shared `firep` selection, which applies the same rule
   * inline for every ship in the arc: canon's
   * `wptr->where != 1 || ptr->phasrtype >= phatowrp` (GECMDS.C:949).
   * Asserting the wiring rather than the identifier. @see issue #62
   * The BEHAVIOUR is pinned in test/game/cybertron/ai-fire-arc.spec.ts.
   */
  it('both AI kinds fire through AiWeapons', () => {
    for (const f of ['src/game/droid/droid-tick.service.ts', 'src/game/cybertron/cybertron-tick.service.ts']) {
      const text = readFileSync(resolve(__dirname, '../../..', f), 'utf8');
      expect(text).toMatch(/new AiWeapons\(/);
    }
  });

  it('and AiWeapons goes through the shared firep selection', () => {
    const text = readFileSync(
      resolve(__dirname, '../../..', 'src/game/ai/ai-weapons.ts'), 'utf8');
    expect(text).toMatch(/(?<![\w$])selectPhaserVictims\s*\(/);
  });

  it('and that selection gates on the hyperspace flag', () => {
    const text = readFileSync(
      resolve(__dirname, '../../..', 'src/game/combat/firep.ts'), 'utf8');
    expect(text).toMatch(/where === 1/);
    expect(text).toMatch(/PHATOWRP/);
  });
});
