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
   * Registers a command under its keyword and all aliases.
   * All keys are lower-cased. Duplicate registration is a no-op (last-write-wins
   * per Map semantics, but callers should not rely on this).
   */
  register(cmd: Command): void {
    this.registry.set(cmd.keyword.toLowerCase(), cmd);
    for (const alias of cmd.aliases) {
      this.registry.set(alias.toLowerCase(), cmd);
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

    const cmd = this.registry.get(keyword);
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
