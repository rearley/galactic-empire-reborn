import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';
import { formatMessage, MessageId, MESSAGE_STRINGS } from '../../src/game/commands/messages';

/**
 * Eight places answered in prose of our own where canon has a string.
 *
 * docs/DECISIONS.md 2026-09-05 already settled the policy — "Where canon has a
 * string, use it" — after a pass that found 349 unwired canon ids and 128
 * invented lines. These six survived that pass. They are residue, not
 * decisions: none appears in that entry's list of deliberate exceptions.
 *
 * Each of them TRADED INFORMATION AWAY to get here, and that is the point.
 * Canon's TFIRE1 does not name what you locked; NEW4 does not say how short
 * you are. Ours did both. The project rule is that canon wins even when ours
 * reads better, so the only defence against re-inventing these next time
 * someone finds the wording thin is this file.
 *
 * The landing page tells visitors "the text on your screen is the text the game
 * printed thirty years ago". That was not quite true while these stood.
 */
describe('restored canon wording', () => {
  const restored: Array<[MessageId, keyof typeof CANON_MESSAGES]> = [
    [MessageId.TFIRE1, 'TFIRE1'],
    [MessageId.MFIRE1, 'MFIRE1'],
    [MessageId.WELCOM, 'WELCOM'],
    [MessageId.RENAME1, 'RENAME1'],
    [MessageId.NEW3, 'NEW3'],
    [MessageId.NEW4, 'NEW4'],
    [MessageId.NEW8, 'NEW8'],
    [MessageId.NEW11, 'NEW11'],
  ];

  it.each(restored)('%s is canon byte for byte, not a paraphrase', (id, key) => {
    expect(MESSAGE_STRINGS[id]).toBe(CANON_MESSAGES[key]);
  });

  it('formats the firing confirmations canon actually prints', () => {
    expect(formatMessage(MessageId.TFIRE1)).toContain('Torpedoes fired sir!');
    expect(formatMessage(MessageId.MFIRE1)).toContain('Missile fired sir!');
  });

  it('welcome keeps canon\'s help hint, which ours had dropped', () => {
    // Ours was "Welcome aboard, <shipname>." — it lost both the commander's
    // name and "Type ? if you need assistance", which is the one pointer a new
    // pilot gets toward the help system.
    const text = formatMessage(MessageId.WELCOM, 'rick');
    expect(text).toContain('Commander rick');
    expect(text).toContain('Type ? if you need assistance');
  });

  it('renames and purchases read as canon', () => {
    expect(formatMessage(MessageId.RENAME1, 'Vraska')).toBe('Your ship is now named The Vraska.');
    expect(formatMessage(MessageId.NEW3, 'Dreadnought')).toBe('You are now the proud owner of a Dreadnought.');
    expect(formatMessage(MessageId.NEW4, 'Dreadnought')).toContain("don't have enough cash");
  });

  it('the two upgrade-affordability refusals name the Mark, as canon does', () => {
    // A second `Insufficient credits...` sat on the phaser/shield path, which
    // is reached from `new phaser <n>` rather than `new <class>` — a different
    // handler branch, and so missed by the pass that fixed the hull one.
    expect(formatMessage(MessageId.NEW8, 3)).toBe(
      "Sorry Sir, We don't have enough cash for a Mark-3 Shield.",
    );
    expect(formatMessage(MessageId.NEW11, 6)).toBe(
      "Sorry Sir, We don't have enough cash for a Mark-6 Phaser.",
    );
  });
});
