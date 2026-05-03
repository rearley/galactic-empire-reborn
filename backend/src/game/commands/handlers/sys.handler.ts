import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';

/**
 * Handles `sys <subcommand>`. Currently supports:
 *   - `sys unjam` — clears the firer's jammer counter immediately.
 *
 * @see GECMDS.C — sys command dispatch
 */
@Injectable()
export class SysHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'sys',
    aliases: [],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.SYS_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship, args);
    },
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'unjam') {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.jammer = 0;
      });
      return {
        lines: [{ text: formatMessage(MessageId.SYS_UNJAM), category: 'system' }],
      };
    }
    return {
      lines: [{ text: formatMessage(MessageId.SYS_UNKNOWN), category: 'system' }],
    };
  }
}
