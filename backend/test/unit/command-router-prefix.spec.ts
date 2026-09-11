/**
 * The router must resolve verbs the way the original did: on the first three
 * characters.
 *
 * GECMDS.C:320 dispatches via `gesearch(margv[0], gecmds, GECMDSIZ)`, and
 * gesearch (GECMDS.C:249) binary-searches the table comparing
 * `strncmp(ptr, md->command, 3)`. Consequences that this spec pins:
 *
 *   - every table verb is exactly 3 characters (`sca`, `pha`, `rep`, `imp`…)
 *   - any longer input whose first 3 characters match resolves: `scan`,
 *     `scanner`, `report`, `phasors` all hit their command
 *   - input SHORTER than the verb does NOT match: strncmp("sc", "sca", 3)
 *     compares '\0' against 'a' and returns non-zero, so `sc` is not a scan
 *   - a 1-char table entry like "?" still matches "?" because strncmp stops at
 *     the shared NUL, but "??" does not match "?"
 *
 * The port previously used exact-match Map lookups, so long forms worked only
 * where someone hand-added an alias and `sc` was wrongly accepted.
 *
 * @see GECMDS.C:123 command table
 * @see GECMDS.C:249 gesearch
 */

import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { Command, CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { MessageId, formatMessage } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    status: 0,
    topspeed: 0,
  });
}

const ctx = {} as CommandContext;
const UNKNOWN = formatMessage(MessageId.UNKNOWN_CMD);

function makeRouter(keyword: string, handler = jest.fn().mockReturnValue({ lines: [] })) {
  const router = new CommandRouterService();
  const cmd: Command = { keyword, aliases: [], minArgs: 0, argMissingMessage: 'missing', handler };
  router.register(cmd);
  return { router, handler };
}

function textOf(result: CommandResult): string {
  return result.lines.map((l) => l.text).join('\n');
}

describe('command router — 3-character prefix matching (GECMDS.C:249 gesearch)', () => {
  describe('longer input resolves on its first 3 characters', () => {
    it.each(['sca', 'scan', 'scanner', 'scandalous'])('%s resolves to the sca command', (input) => {
      const { router, handler } = makeRouter('sca');
      router.dispatch(input, makeShip(), ctx);
      expect(handler).toHaveBeenCalled();
    });

    it('passes the remaining tokens through as args, unaffected by verb length', () => {
      const { router, handler } = makeRouter('sca');
      router.dispatch('scan lo', makeShip(), ctx);
      expect(handler).toHaveBeenCalledWith(expect.anything(), ['lo'], ctx);
    });
  });

  describe('input shorter than the verb does not match', () => {
    it.each(['sc', 's'])('%s is not a valid verb', (input) => {
      const { router, handler } = makeRouter('sca');
      const result = router.dispatch(input, makeShip(), ctx) as CommandResult;
      expect(handler).not.toHaveBeenCalled();
      expect(textOf(result)).toBe(UNKNOWN);
    });
  });

  describe('a differing 3rd character is a different command', () => {
    it('sel and sen do not collide', () => {
      const router = new CommandRouterService();
      const sell = jest.fn().mockReturnValue({ lines: [] });
      const send = jest.fn().mockReturnValue({ lines: [] });
      router.register({ keyword: 'sel', aliases: [], minArgs: 0, argMissingMessage: '', handler: sell });
      router.register({ keyword: 'sen', aliases: [], minArgs: 0, argMissingMessage: '', handler: send });

      router.dispatch('sell', makeShip(), ctx);
      expect(sell).toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('short table entries keep exact-match semantics', () => {
    it('? resolves to the help command', () => {
      const { router, handler } = makeRouter('?');
      router.dispatch('?', makeShip(), ctx);
      expect(handler).toHaveBeenCalled();
    });

    it('?? does not resolve to ?', () => {
      const { router, handler } = makeRouter('?');
      const result = router.dispatch('??', makeShip(), ctx) as CommandResult;
      expect(handler).not.toHaveBeenCalled();
      expect(textOf(result)).toBe(UNKNOWN);
    });
  });

  describe('case insensitivity is preserved', () => {
    it.each(['SCAN', 'Sca', 'ScAnNeR'])('%s resolves', (input) => {
      const { router, handler } = makeRouter('sca');
      router.dispatch(input, makeShip(), ctx);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('registration guards against silently shadowing a command', () => {
    it('throws when two different commands share a 3-char prefix', () => {
      const router = new CommandRouterService();
      router.register({ keyword: 'mai', aliases: [], minArgs: 0, argMissingMessage: '', handler: jest.fn() });
      expect(() =>
        router.register({ keyword: 'maint', aliases: [], minArgs: 0, argMissingMessage: '', handler: jest.fn() }),
      ).toThrow(/prefix/i);
    });

    it('re-registering the same command object is not a collision', () => {
      const router = new CommandRouterService();
      const cmd: Command = { keyword: 'sca', aliases: [], minArgs: 0, argMissingMessage: '', handler: jest.fn() };
      router.register(cmd);
      expect(() => router.register(cmd)).not.toThrow();
    });
  });
});
