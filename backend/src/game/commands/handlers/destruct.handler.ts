import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { COUNTDOWN } from '../_ship-management-constants';

/**
 * Handles `destruct` — initiates the self-destruct countdown.
 *
 * Sets ShipState.destruct = COUNTDOWN (20). The ShipManagementTickService
 * decrements it each physics tick (6s), broadcasting sector warnings until
 * the ship is destroyed at 0.
 *
 * Rejection gates:
 *  - Neutral zone (sector 0,0): canonical rejection per GEFUNCS.C:725-729
 *  - Already counting down: destruct > 0
 *
 * @see GECMDS.C:5025 cmd_destruct
 * @see GEFUNCS.C:1820 destruct() — tick-driven countdown in ShipManagementTickService
 */
@Injectable()
export class DestructHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'destruct',
    aliases: ['des'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship),
  };

  private handle(ship: ShipState): CommandResult {
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const inNeutralZone = xsect === 0 && ysect === 0;

    if (inNeutralZone) {
      return { lines: [{ text: formatMessage(MessageId.DESTRUCT_NZ), category: 'system' }] };
    }

    if (ship.destruct > 0) {
      return { lines: [{ text: formatMessage(MessageId.DESTRUCT_ACTIVE), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.destruct = COUNTDOWN;
    });

    return {
      lines: [{ text: formatMessage(MessageId.DESTRUCT_START), category: 'system' }],
      broadcasts: [
        {
          room: `sector:${xsect}:${ysect}`,
          event: 'event.log',
          payload: {
            category: 'system',
            text: formatMessage(MessageId.DESTRUCT_SECTOR_START, ship.shipname),
          },
        },
      ],
    };
  }
}
