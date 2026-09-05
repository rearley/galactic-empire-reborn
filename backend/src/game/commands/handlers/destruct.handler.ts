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
 * The only gate is the neutral zone. Re-issuing `destruct` mid-countdown is
 * not an error in canon — cmd_destruct sets `destruct = COUNTDOWN`
 * unconditionally, so a second call RESTARTS the timer at 20 and reprints
 * SELFD1. The port used to refuse with an invented "already in progress",
 * which quietly made the countdown un-extendable.
 *
 * Nor does starting one tell the sector. Canon's first outrange is SELFD2A at
 * ten ticks remaining (GEFUNCS.C:1835) — the neighbours get eight ticks of
 * warning, not twenty, and the port's start-broadcast gave the game away.
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

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.destruct = COUNTDOWN;
    });

    return { lines: [{ text: formatMessage(MessageId.DESTRUCT_START), category: 'system' }] };
  }
}
