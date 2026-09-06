/**
 * `hel transfer` must describe the transfer command this port actually ships.
 *
 * Canon's HLPTRA (MBMGEHLP.MSG:1095) documents two legs — ship-to-planet and
 * planet-to-ship — because that is all `cmd_transfer` had. This port also has a
 * third: ship-to-ship, a deliberate addition recorded in docs/DECISIONS.md (D1).
 *
 * The help resolver prefers a canon page over our curated topic
 * (help.handler.ts), and rightly so: canon's own words are better than ours
 * wherever canon has them. But `transfer` is not one of our topic IDs, so
 * `hel transfer` returned canon's page verbatim and a player reading it would
 * conclude the ship-to-ship leg does not exist.
 *
 * The fix is NOT to rewrite canon's page. CLAUDE.md is explicit that canon text
 * is not ours to edit, and the in-game help is canon's design intent. The port's
 * addition is appended after it, marked as this port's, so the canon page stays
 * exactly as shipped and the player still learns the command they have.
 */
import { HelpHandlerService } from '../../../../src/game/commands/handlers/help.handler';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

const ship = {} as ShipState;
const ctx: CommandContext = {};

const textOf = (r: CommandResult) => r.lines.map((l) => l.text).join('\n');

describe('hel transfer (MBMGEHLP.MSG:1095 HLPTRA + deviation D1)', () => {
  it("still serves canon's page", () => {
    const res = new HelpHandlerService().command.handler(ship, ['transfer'], ctx) as CommandResult;

    // Canon's own wording, unedited.
    expect(textOf(res)).toContain('transfer goods from your ship');
  });

  it('also documents the ship-to-ship leg this port adds', () => {
    const res = new HelpHandlerService().command.handler(ship, ['transfer'], ctx) as CommandResult;

    const text = textOf(res).toLowerCase();
    expect(text).toContain('another ship');
  });

  it('marks the addition as this port\'s, not as canon', () => {
    // A player should be able to tell which half is the original game.
    const res = new HelpHandlerService().command.handler(ship, ['transfer'], ctx) as CommandResult;

    expect(textOf(res).toLowerCase()).toContain('this port');
  });

  it('leaves an unrelated canon page untouched', () => {
    const res = new HelpHandlerService().command.handler(ship, ['warp'], ctx) as CommandResult;

    expect(textOf(res).toLowerCase()).not.toContain('this port');
  });
});
