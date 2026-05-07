import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';

const VALID_OPTIONS = ['auto-shield', 'auto-repair'] as const;
type ValidOption = (typeof VALID_OPTIONS)[number];

/**
 * Handles `set <auto-shield|auto-repair> <on|off>` and `set ?`.
 *
 * Deviation D4: canonical cmd_set (GECMDS.C:5190) manages scannames/scanhome/scanfull/filter
 * on User.options[]. This version manages auto-shield and auto-repair flags on ShipState.
 * @see research.md D4
 * @see GECMDS.C:5190 cmd_set (canonical — option set reinterpreted)
 */
@Injectable()
export class SetHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'set',
    aliases: [],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.SET_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship, args),
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const optArg = args[0]?.toLowerCase() ?? '';

    if (optArg === '?') {
      const shieldVal = ship.autoShield ? 'ON' : 'OFF';
      const repairVal = ship.autoRepair ? 'ON' : 'OFF';
      return {
        lines: [{ text: formatMessage(MessageId.SET_STATUS, shieldVal, repairVal), category: 'info' }],
      };
    }

    if (!VALID_OPTIONS.includes(optArg as ValidOption)) {
      return { lines: [{ text: formatMessage(MessageId.SET_UNKNOWN), category: 'system' }] };
    }

    const toggleArg = args[1]?.toLowerCase() ?? '';
    if (toggleArg !== 'on' && toggleArg !== 'off') {
      return { lines: [{ text: formatMessage(MessageId.SET_FMT), category: 'system' }] };
    }

    const newVal = toggleArg === 'on';

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      if (optArg === 'auto-shield') {
        s.autoShield = newVal;
      } else {
        s.autoRepair = newVal;
      }
    });

    const msgId = newVal ? MessageId.SET_OK_ON : MessageId.SET_OK_OFF;
    return { lines: [{ text: formatMessage(msgId, optArg), category: 'success' }] };
  }
}
