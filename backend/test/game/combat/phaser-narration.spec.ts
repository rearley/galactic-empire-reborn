/**
 * Canon narrates a phaser exchange in five messages, and the port had none.
 *
 *   PFIRED    to the firer on discharge           GECMDS.C:943-944
 *   PHITHIM   to the firer, hull damage dealt     GECMDS.C:984-986
 *   PHITYOU   to the victim, hull damage taken    GECMDS.C:987-988
 *   PDEFLECT  to the firer, beam turned by shields GECMDS.C:993-994
 *   PHITDEF   to the victim, deflected magnitude  GECMDS.C:995-996
 *
 * The port printed one debug line for every outcome:
 * "Phaser hit on X: shield -N, hull -N." Three separate playtesters concluded
 * from that that phasers were broken — because a DEFLECTED beam and a MISS
 * were indistinguishable, and a shielded target takes no hull damage at all
 * (the SHIELDUP branch never touches wptr->damage, GECMDS.C:986-997).
 *
 * Note the asymmetry, which is canon's own: a hull hit reports damage as a
 * WORD through damstr (%s), while a deflection reports a numeric magnitude
 * (%d). Both are preserved.
 */

import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { damstr } from '../../../src/game/combat/combat-math';

describe('phaser narration text', () => {
  it('PFIRED names the power and focus actually used', () => {
    const text = formatMessage(MessageId.PFIRED, 75, 3);
    expect(text).toContain('75');
    expect(text).toContain('3');
    expect(text).toMatch(/percent power/i);
  });

  it('a landed hit and a deflection read differently', () => {
    const landed = formatMessage(MessageId.PHITHIM, damstr(40), 'Vega');
    const turned = formatMessage(MessageId.PDEFLECT, 'Vega');
    expect(landed).not.toBe(turned);
    expect(turned).toMatch(/deflected/i);
    expect(landed).toMatch(/caused/i);
  });

  it('reports hull damage as a word and a deflection as a number', () => {
    // damstr is why PHITHIM takes %s and PHITDEF takes %d.
    expect(formatMessage(MessageId.PHITHIM, damstr(40), 'Vega')).not.toMatch(/\b40\b/);
    expect(formatMessage(MessageId.PHITDEF, 'Vega', 40)).toMatch(/\b40\b/);
  });

  it('the victim is told who fired, in both outcomes', () => {
    expect(formatMessage(MessageId.PHITYOU, 'Vega', damstr(10))).toContain('Vega');
    // PHITDEF leads with the attacker's scan LETTER (%c) before the
    // commander — "Phaser hit from Ship %c, Commander %s's ship". The port's
    // copy of the string had dropped the %c, so this call had two arguments
    // where canon has three and 'Vega' landed in the letter's slot.
    expect(formatMessage(MessageId.PHITDEF, 'B', 'Vega', 10)).toContain('Vega');
  });

  it('no message still renders an unfilled slot', () => {
    // The `orb` regression: a template gained a %d and its call site did not,
    // so the name landed in the number slot and the %s came out empty.
    for (const text of [
      formatMessage(MessageId.PFIRED, 75, 3),
      formatMessage(MessageId.PHITHIM, damstr(40), 'Vega'),
      formatMessage(MessageId.PHITYOU, 'Vega', damstr(40)),
      formatMessage(MessageId.PDEFLECT, 'Vega'),
      formatMessage(MessageId.PHITDEF, 'Vega', 40),
    ]) {
      expect(text).not.toMatch(/%[ds]/);
    }
  });
});
