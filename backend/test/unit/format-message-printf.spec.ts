/**
 * formatMessage has to speak C's printf, because the strings are C's.
 *
 * It recognised only %s %d %u %f. Two gaps were silently mangling canon text
 * that had been wired correctly:
 *
 *   %c  was not in the set at all, so it passed through into the output. Canon
 *       uses it for the SHIP LETTER — LOCK3/LOCK5 when fire control cannot hold
 *       a target, PHITDEF when shields turn a phaser, all three RADSET
 *       confirmations. Every one printed a literal "%c" at the player.
 *   width and the `-` flag were matched and then discarded, so `%-11s` and
 *       `%5u` lost their padding. ADMIN03 is a planet accounting table and
 *       ROS_ROW is the roster; both are columns held together by that padding.
 */
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';

/** Format an arbitrary string by borrowing a message id's slot. */
function fmt(id: MessageId, ...args: Array<string | number>): string {
  return formatMessage(id, ...args);
}

describe('formatMessage speaks canon printf', () => {
  it('substitutes %c with a single character', () => {
    // LOCK3: "Fire control scanners cannot get a positive lock on ship %c, Sir!"
    expect(fmt(MessageId.LOCK_FAIL, 'B')).toBe(
      'Fire control scanners cannot get a positive lock on ship B, Sir!',
    );
    expect(fmt(MessageId.LOCK_FAIL, 'B')).not.toContain('%c');
  });

  it('takes only the first character for %c, as C does', () => {
    expect(fmt(MessageId.LOCK_FAIL, 'Bravo')).toContain('on ship B, Sir!');
  });

  it('fills %c, %s and %d in one string, in order', () => {
    // PHITDEF: "...from Ship %c, Commander %s's ship,\nmagnitude %d..."
    const out = fmt(MessageId.PHITDEF, 'C', 'Vega', 42);
    expect(out).toContain('from Ship C,');
    expect(out).toContain("Commander Vega's ship");
    expect(out).toContain('magnitude 42');
  });

  it('pads a %Nd field on the left, so columns line up', () => {
    // ROS_ROW is ' %4s  %s %10s  %5s  %5s  %10s' — the roster, which is columns
    // and nothing else. The widths were parsed and thrown away, so every row
    // rendered ragged however carefully the string was written.
    const out = fmt(MessageId.ROS_ROW, 1, 'alice', 100, 2, 3, 4);
    expect(out).toContain('   1');   // width 4, right-aligned
    expect(out).toContain('       100'); // width 10
  });

  it('left-justifies when the - flag is present', () => {
    // PLN_ROW is canon's '%-20s %5d %5d  %d ' — a left-justified name column
    // followed by right-justified coordinates.
    const out = fmt(MessageId.PLN_ROW, 'Aurora', 5, 6, 1);
    expect(out.startsWith('Aurora              ')).toBe(true);  // padded to 20
    expect(out).toContain('    5');                             // width 5, right
  });

  it('leaves %% as a literal percent and consumes no argument', () => {
    // Nothing in canon that we wire uses %%, but the formatter must not treat
    // it as a slot — doing so would shift every later argument by one.
    const raw = CANON_MESSAGES.LOCK3;
    expect(raw).not.toContain('%%');
  });

  it('renders an unfilled slot as empty rather than printing the specifier', () => {
    expect(fmt(MessageId.LOCK_FAIL)).toBe(
      'Fire control scanners cannot get a positive lock on ship , Sir!',
    );
  });
});
