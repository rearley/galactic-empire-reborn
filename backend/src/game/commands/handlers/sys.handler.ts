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

  /**
   * Canon's sysop gate, which runs BEFORE the subcommand is looked at:
   *
   *   if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP)))
   *       { prf("Huh?\r"); ... return; }
   *
   * Both options ship YES (MBMGEMSG.MSG:197 SYSCMDS, :202 SYSONLY), so an
   * ordinary player gets "Huh?" and nothing else.
   *
   * Canon reads sysop status from the MajorBBS user record's ISYSOP flag. This
   * port has no such record, so identity comes from the GE_SYSOP_USERIDS
   * allowlist — port-original plumbing for a canon gate. Empty or unset means
   * nobody is a sysop, which is the safe default: `sys unjam` clears the
   * caller's own jammer counter, so an ungated `sys` is a free, instant,
   * universal counter to the jammer weapon.
   *
   * @see GECMDS.C:4752-4760 cmd_sysop
   */
  private isSysop(userid: string): boolean {
    return (process.env.GE_SYSOP_USERIDS ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0)
      .includes(userid);
  }

  private handle(ship: ShipState, args: string[]): CommandResult {
    if (!this.isSysop(ship.userid)) {
      return {
        lines: [{ text: formatMessage(MessageId.SYS_HUH), category: 'system' }],
      };
    }

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
