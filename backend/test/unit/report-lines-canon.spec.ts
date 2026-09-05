/**
 * `rep sys` lines take the arguments canon's messages declare.
 *
 * Found in live play, and self-inflicted: mapping REP10/REP11 to canon's text
 * without changing their call sites printed
 *
 *   Shields (Mark-)...... DOWN
 *
 * because `REP11 {Shields (Mark-%d)...... DOWN}` takes the shield mark and we
 * passed nothing. REP10 had the mirror problem — it was given the mark AND a
 * charge percentage, but canon's REP10 has one slot and reports charge on its
 * own line (REP11B, "Shield Bank Charge .... %d"), so the percentage vanished.
 *
 * Canon also has no "(100% charged)" phaser line: REP23 says <operative> and
 * REP24 <inoperable>, gated on whether the bank can actually fire.
 *
 * A message that silently drops or invents an argument still renders, which is
 * why this pins the rendered LINES rather than the format strings.
 */
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { PMINFIRE } from '../../src/game/constants';

describe('report lines fill canon\'s slots', () => {
  it('names the shield mark when they are DOWN', () => {
    expect(formatMessage(MessageId.REP11, 2)).toBe('Shields (Mark-2)...... DOWN');
    expect(formatMessage(MessageId.REP11, 2)).not.toContain('(Mark-)');
  });

  it('names the shield mark when they are UP, without swallowing the charge', () => {
    expect(formatMessage(MessageId.REP10, 3)).toBe('Shields (Mark-3)...... UP');
  });

  it('reports the bank charge on its own line, as canon does', () => {
    expect(formatMessage(MessageId.REP11B, 42)).toBe('Shield Bank Charge .... 42');
  });

  it('calls a phaser operative or inoperable, not a percentage', () => {
    expect(formatMessage(MessageId.REP23, 2)).toBe('Phasers (Mark-2)  <operative>');
    expect(formatMessage(MessageId.REP24, 2)).toBe('Phasers (Mark-2)  <inoperable>');
    expect(PMINFIRE).toBe(60); // the gate the report branches on
  });

  it('leaves no empty slot in any of them', () => {
    const rendered = [
      formatMessage(MessageId.REP10, 1),
      formatMessage(MessageId.REP11, 1),
      formatMessage(MessageId.REP11B, 1),
      formatMessage(MessageId.REP23, 1),
      formatMessage(MessageId.REP24, 1),
    ];
    for (const line of rendered) {
      expect(line).not.toMatch(/\(Mark-\)/);
      expect(line).not.toMatch(/%[sudu]/);
    }
  });
});
