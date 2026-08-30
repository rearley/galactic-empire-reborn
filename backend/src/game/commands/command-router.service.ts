import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from './command.types';
import { formatMessage, MessageId } from './messages';
import { ShipState } from '../ship/ship-state.types';
import { SHIP_STATUS_ABANDONED } from './_ship-management-constants';

/**
 * Routes player text input to registered command handlers.
 * Tokenises input (trim, lower-case, split on whitespace), resolves aliases,
 * validates arg count, and delegates to the handler.
 *
 * @see GECMDS.C:111-225 command table — all keywords and aliases
 * @see GECMDS.C dispatch loop
 */
@Injectable()
export class CommandRouterService {
  private readonly registry = new Map<string, Command>();

  /**
   * Reduces a verb to the key the original matched on.
   *
   * gesearch compares `strncmp(ptr, md->command, 3)`, i.e. at most the first
   * three characters, stopping early at a NUL. Truncating both the registered
   * verb and the player's input to 3 characters reproduces that exactly:
   * `scan` and `sca` collapse to the same key, while `sc` stays distinct
   * (strncmp would compare '\0' against 'a' and return non-zero).
   *
   * @see GECMDS.C:249 gesearch
   */
  private static matchKey(verb: string): string {
    return verb.toLowerCase().slice(0, 3);
  }

  /**
   * Registers a command under its keyword and all aliases, keyed by the
   * 3-character prefix the original dispatcher matched on.
   *
   * Throws if two DIFFERENT commands would occupy the same prefix — under
   * prefix matching one would silently shadow the other, which is how a verb
   * like `maint` can quietly become unreachable behind `mai`.
   */
  register(cmd: Command): void {
    for (const verb of [cmd.keyword, ...cmd.aliases]) {
      const key = CommandRouterService.matchKey(verb);
      const existing = this.registry.get(key);
      if (existing && existing !== cmd) {
        throw new Error(
          `Command prefix collision: '${verb}' and '${existing.keyword}' both resolve to '${key}'. ` +
            'The original dispatcher matches on the first 3 characters (GECMDS.C:249), ' +
            'so these cannot coexist as separate commands.',
        );
      }
      this.registry.set(key, cmd);
    }
  }

  /**
   * Dispatches raw player text input to the appropriate command handler.
   *
   * Rules (mirror original BBS game behaviour):
   * - Empty / whitespace-only input → `{ lines: [] }` (silent drop, no event emitted)
   * - Unknown keyword → single `system` line with `UNKNOWN_CMD`
   * - Insufficient args → single `system` line with the command's `argMissingMessage`
   * - Otherwise → delegates to `cmd.handler`
   *
   * @see GECMDS.C dispatch path
   */
  dispatch(rawInput: string, ship: ShipState, ctx: CommandContext): CommandResult | Promise<CommandResult> {
    const trimmed = rawInput.trim();
    if (trimmed === '') {
      return { lines: [] };
    }

    const tokens = trimmed.split(/\s+/);
    const keyword = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    // FR-803: reject all commands when the ship has been abandoned.
    if (ship.status === SHIP_STATUS_ABANDONED) {
      return {
        lines: [{ text: formatMessage(MessageId.SHIP_ABANDONED), category: 'system' }],
      };
    }

    const cmd = this.registry.get(CommandRouterService.matchKey(keyword));
    if (!cmd) {
      return {
        lines: [
          {
            text: formatMessage(MessageId.UNKNOWN_CMD),
            category: 'system',
          },
        ],
      };
    }

    if (args.length < cmd.minArgs) {
      return {
        lines: [
          {
            text: cmd.argMissingMessage,
            category: 'system',
          },
        ],
      };
    }

    return cmd.handler(ship, args, ctx);
  }
}
