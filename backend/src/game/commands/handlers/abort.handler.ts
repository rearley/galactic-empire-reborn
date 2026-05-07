import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';

/** Threshold below which the sector abort broadcast fires (SELFD4A). @see GECMDS.C:5044 */
const ABORT_BROADCAST_THRESHOLD = 10 as const;

/**
 * Handles `abort` — cancels an active self-destruct countdown.
 *
 * Per SELFD4A: sector broadcast only fires when destruct < 10 at abort time
 * (countdown is far enough along that the sector was already warned).
 *
 * @see GECMDS.C:5044 cmd_abort
 */
@Injectable()
export class AbortHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'abort',
    aliases: ['abo'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship),
  };

  private handle(ship: ShipState): CommandResult {
    if (ship.destruct <= 0) {
      return { lines: [{ text: formatMessage(MessageId.ABORT_NONE), category: 'system' }] };
    }

    const countAtAbort = ship.destruct;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.destruct = 0;
    });

    const result: CommandResult = {
      lines: [{ text: formatMessage(MessageId.ABORT_OK), category: 'success' }],
    };

    // SELFD4A: sector broadcast only when countdown was < 10 at abort time.
    if (countAtAbort < ABORT_BROADCAST_THRESHOLD) {
      const xsect = Math.floor(ship.xcoord);
      const ysect = Math.floor(ship.ycoord);
      result.broadcasts = [
        {
          room: `sector:${xsect}:${ysect}`,
          event: 'event.log',
          payload: {
            category: 'system',
            text: formatMessage(MessageId.ABORT_SECTOR, ship.shipname),
          },
        },
      ];
    }

    return result;
  }
}
