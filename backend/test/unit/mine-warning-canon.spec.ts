/**
 * The mine proximity warning is canon's MINE6, in canon's words.
 *
 *   MINE6 {***
 *   WARNING! WARNING!
 *   Sensors indicate a neutron mine bearing %d, distance %u.
 *
 * @see GE/REL/MBMGEMSG.MSG:5829
 *
 * The port wrote its own line — "** Mine detected — bearing N, range N. **" —
 * and it was tempting to read that as an invention papering over a scan map
 * that could not draw mines. It is not: canon has BOTH the '.' on the map and
 * this warning. Only the wording was ours.
 *
 * The three-line shape matters. Canon's `***` banner is the same attention
 * marker the Cybertron taunts use, and reading one line deep is how a previous
 * round mistook those taunts for a port invention too.
 */
import { formatMessage, MessageId } from '../../src/game/commands/messages';

describe('MINE6 proximity warning', () => {
  const text = formatMessage(MessageId.MINE6, 42, 3100);

  it('opens with canon\'s *** banner', () => {
    expect(text.split('\n')[0]).toBe('***');
  });

  it('carries the doubled warning line', () => {
    expect(text).toContain('WARNING! WARNING!');
  });

  it('names the weapon, the bearing and the distance', () => {
    expect(text).toContain('Sensors indicate a neutron mine bearing 42, distance 3100.');
  });

  it('is not the port\'s invented wording', () => {
    expect(text).not.toContain('Mine detected');
    expect(text).not.toMatch(/range \d/);
  });
});
