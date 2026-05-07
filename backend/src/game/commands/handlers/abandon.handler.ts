import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { SHIP_STATUS_ABANDONED } from '../_ship-management-constants';

/**
 * Handles `abandon` — detaches the captain from their current ship.
 *
 * Deviation D2: canonical cmd_abandon (GECMDS.C:3420) abandons a planet colony.
 * This version marks the ship as abandoned and routes the captain back through
 * the feature-011 onboarding flow (FR-704).
 *
 * If destruct > 0, the countdown is cleared first (abandon takes precedence,
 * per spec.md Edge Cases).
 *
 * @see GECMDS.C:3420 cmd_abandon (canonical — semantics reinterpreted)
 * @see research.md D2
 */
@Injectable()
export class AbandonHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'abandon',
    aliases: ['aba'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], ctx: CommandContext): CommandResult =>
      this.handle(ship, ctx),
  };

  private handle(ship: ShipState, ctx: CommandContext): CommandResult {
    const shipname = ship.shipname;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    // Mark ship as abandoned and clear any active destruct countdown.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.status = SHIP_STATUS_ABANDONED;
      s.destruct = 0;
    });

    // Detach captain from gateway session (clear activeShipNo so next command goes to onboarding).
    if (ctx.client) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ctx.client.data.activeShipNo = undefined;
    }

    return {
      lines: [{ text: formatMessage(MessageId.ABANDON_OK, shipname), category: 'success' }],
      broadcasts: [
        {
          room: `sector:${xsect}:${ysect}`,
          event: 'event.log',
          payload: {
            category: 'info',
            text: formatMessage(MessageId.ABANDON_SECTOR, shipname),
          },
        },
      ],
    };
  }
}
