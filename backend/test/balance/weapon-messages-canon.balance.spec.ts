/**
 * The weapon refusals speak canon's words, under canon's ids.
 *
 * A first sweep fixed every string where we already used canon's message id.
 * It missed a second, larger layer: 190 of our strings were invented wholesale
 * — our own id AND our own text — sitting on top of a canon message we had
 * simply never wired. Measured across the C source: 502 message ids are
 * actually printed by canon and we carried 141 of them.
 *
 *   ours: MIN_NOMINE  "No mine launcher mounted."
 *   canon: MINE0      "We don't have a mine launching system Sir!"
 *
 * The mapping is not guesswork — the C names the id each branch prints, so
 * `cmd_mine` gives MINE0/MINE7/PCLOKUP/MINE1/MINFMT/MINE3/MINE2 in order and
 * our handler has the matching branches (GECMDS.C:1722-1782).
 *
 * These are the messages a pilot reads most, because they are what a refused
 * shot says. Pinned here so a future edit cannot quietly put an app voice back.
 */
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';

/** ours -> the canon id the C prints in that branch. */
const MAPPING: ReadonlyArray<readonly [MessageId, string, string]> = [
  // cmd_mine — GECMDS.C:1722-1782
  [MessageId.MIN_NOMINE, 'MINE0', 'has_mine == 0'],
  [MessageId.MIN_NEUTRAL, 'MINE7', 'neutral(coord)'],
  [MessageId.MIN_CLOAK, 'PCLOKUP', 'cloak > 0'],
  [MessageId.MIN_NOAMMO, 'MINE1', 'items[I_MINE] <= 0'],
  [MessageId.MIN_JAMMED, 'MINE2', 'laymine returned 0 — the table is full'],
  // cmd_torp — GECMDS.C
  [MessageId.TOR_NOTOR, 'TORP3', 'max_torps == 0'],
  [MessageId.TOR_WARP, 'TORP2', 'where == 1'],
  [MessageId.TOR_CLOAK, 'PCLOKUP', 'cloak > 0'],
  [MessageId.TOR_NOAMMO, 'NOTORPS', 'items[I_TORPEDO] == 0'],
  [MessageId.TOR_FMT, 'NOSHIP', 'no target named — canon does NOT print a usage line'],
  // cmd_missl
  [MessageId.MIS_NOMIS, 'MISS01', 'max_missl == 0'],
  [MessageId.MIS_CLOAK, 'PCLOKUP', 'cloak > 0'],
  [MessageId.MIS_NOAMMO, 'NOMISSL', 'items[I_MISSILE] == 0'],
  [MessageId.MIS_FMT, 'MISFMT', 'bad or missing charge'],
  // cmd_phas
  [MessageId.PHA_NOPHAS, 'PHASER0', 'max_phasr == 0'],
  [MessageId.PHA_NOPOW, 'PHANONE', 'phasr < PMINFIRE'],
  [MessageId.PHA_FMT, 'PHAFMT', 'bad degree/focus'],
  [MessageId.PHA_CLOAK, 'PCLOKUP', 'cloak > 0'],
  [MessageId.HP_WAIT, 'HPWAIT', 'hyper-phaser still cooling'],
];

describe('weapon refusals use canon message text', () => {
  it.each(MAPPING)('%s speaks canon %s (%s)', (ours, canonId) => {
    expect(formatMessage(ours)).toBe(CANON_MESSAGES[canonId]);
  });

  it('none of them still reads like a modern app', () => {
    const appish = [
      'No mine launcher mounted.',
      'You have no mines.',
      'No torpedo launcher mounted.',
      'Insufficient phaser power.',
    ];
    const all = MAPPING.map(([id]) => formatMessage(id));
    for (const phrase of appish) expect(all).not.toContain(phrase);
  });

  it('keeps canon\'s shipboard address, which is the point', () => {
    // Canon talks to a captain; that voice is most of what the game feels like.
    const joined = MAPPING.map(([id]) => formatMessage(id)).join('\n');
    expect(joined).toMatch(/Sir/);
    expect(joined).toMatch(/this tub/);
  });
});
