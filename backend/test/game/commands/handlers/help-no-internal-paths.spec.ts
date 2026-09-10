/**
 * Nothing a player can read may point at a file only a developer has.
 *
 * `hel transfer` ended with "See docs/DECISIONS.md (D1)." The sentence was
 * written for the repository, where D1 is the ruling that keeps a non-canon
 * ship-to-ship leg on purpose. To a player at a terminal it names a file they
 * cannot open, about a decision they were not part of, and it reads as an
 * unfinished note rather than as help.
 *
 * The rule is the boundary, not the one string: help text explains the game to
 * someone playing it. The provenance of a deviation belongs in the comment
 * above the string, which is where it now lives.
 */
import { HelpHandlerService } from '../../../../src/game/commands/handlers/help.handler';
import { HELP_TOPIC_IDS } from '../../../../src/game/commands/help/help-topics';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

const ship = {} as ShipState;
const ctx: CommandContext = {};

/** Repository paths: a `docs/` or `specs/` directory, or any bare `.md` file. */
const INTERNAL_PATH = /\b(docs|specs)\/|\.md\b/i;

const textOf = (r: CommandResult) => r.lines.map((l) => l.text).join('\n');

function pageFor(query: string): string {
  return textOf(new HelpHandlerService().command.handler(ship, [query], ctx) as CommandResult);
}

describe('in-game help never cites a repository path', () => {
  it.each([...HELP_TOPIC_IDS])('topic %s', (id) => {
    expect(pageFor(id)).not.toMatch(INTERNAL_PATH);
  });

  // The canon pages carry our addenda, which is where the leak was.
  it.each(['transfer', 'warp', 'scan', 'buy'])('canon page %s', (cmd) => {
    expect(pageFor(cmd)).not.toMatch(INTERNAL_PATH);
  });

  it('bare `hel` is clean too', () => {
    expect(textOf(new HelpHandlerService().command.handler(ship, [], ctx) as CommandResult))
      .not.toMatch(INTERNAL_PATH);
  });
});
