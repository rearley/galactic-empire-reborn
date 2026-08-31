import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';

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

    // Mark ship as abandoned and clear any active destruct countdown. This goes
    // through ShipStateService.abandon rather than mutate() because `status` is
    // stripped from the per-tick flush — set in memory alone, the mark vanished
    // on the next restart and the hull came back flyable.
    void this.shipState.abandon(ship.userid, ship.shipno);

    // Detach captain from gateway session (clear activeShipNo so next command goes to onboarding).
    if (ctx.client) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ctx.client.data.activeShipNo = undefined;
    }

    return {
      lines: [{ text: formatMessage(MessageId.ABANDON_OK, shipname), category: 'success' }],
      // FR-704 — hand the captain straight back to ship entry. Clearing
      // activeShipNo alone left the session answering "No active ship." to
      // every command, with no way to acquire a new hull.
      reenterShipEntry: true,
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
