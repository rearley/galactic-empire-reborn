/**
 * A message that canon already writes in full must not be re-typed onto itself.
 *
 * `MESSAGE_STRINGS` maps a MessageId to its text, usually straight from
 * `CANON_MESSAGES` — generated from MBMGEMSG.MSG by tools/extract-messages.mjs.
 * Four shipyard entries appended a hand-typed copy of the SAME sentence to the
 * generated value:
 *
 *   [MessageId.NEW10]:
 *     CANON_MESSAGES.NEW10                                        // complete already
 *     + 'The Yardmaster Reports: For the meager sum of %s\n'      // duplicate
 *     + 'your ship now has a Mark-%d Phaser System.',
 *
 * so the template carried FOUR placeholders and the call site passes two. The
 * player saw the report twice, the second time with the numbers missing:
 *
 *     The Yardmaster Reports: For the meager sum of 253,333
 *     your ship now has a Mark-6 Phaser System.The Yardmaster Reports: For the
 *     meager sum of
 *     your ship now has a Mark- Phaser System.
 *
 * Reported from play on `new phaser 6`. NEW7 had it for shields, NEW18/NEW28
 * for the downgrade refund — the same defect on three paths nobody had walked.
 *
 * The guard is a placeholder COUNT, not a string comparison, so entries that
 * legitimately extend a canon message (canon truncates some mid-sentence and
 * relies on the caller to `prf` the rest) still pass, while a duplicated
 * sentence cannot.
 *
 * @see CLAUDE.md — "Do not hand-transcribe canon into the codebase."
 */

import { MessageId, MESSAGE_STRINGS } from '../../src/game/commands/messages';
import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';

const PLACEHOLDER = /%%|%[-+ 0#]*\d*(?:\.\d+)?(?:hh|h|ll|l)?[sduxXfc]/g;

const countPlaceholders = (s: string): number =>
  (s.match(PLACEHOLDER) ?? []).filter((m) => m !== '%%').length;

describe('a canon message is never re-typed onto itself', () => {
  const canon = CANON_MESSAGES as Record<string, string | undefined>;

  const shared = Object.values(MessageId).filter(
    (id) => typeof canon[id] === 'string',
  ) as MessageId[];

  it('covers a meaningful share of the table', () => {
    expect(shared.length).toBeGreaterThan(100);
  });

  it.each(shared)('%s takes no more arguments than canon does', (id) => {
    expect(countPlaceholders(MESSAGE_STRINGS[id])).toBe(
      countPlaceholders(canon[id] as string),
    );
  });
});

describe('the Yardmaster reports the fitting exactly once (MBMGEMSG.MSG NEW10)', () => {
  it('renders the phaser report with no second, empty copy', () => {
    const text = MESSAGE_STRINGS[MessageId.NEW10];

    expect(text).toBe(CANON_MESSAGES.NEW10);
    expect(text.match(/Yardmaster Reports/g)).toHaveLength(1);
  });

  it('does the same for the shield report', () => {
    expect(MESSAGE_STRINGS[MessageId.NEW7]).toBe(CANON_MESSAGES.NEW7);
  });

  it('and for both downgrade-refund notices', () => {
    expect(MESSAGE_STRINGS[MessageId.NEW18]).toBe(CANON_MESSAGES.NEW18);
    expect(MESSAGE_STRINGS[MessageId.NEW28]).toBe(CANON_MESSAGES.NEW28);
  });
});
