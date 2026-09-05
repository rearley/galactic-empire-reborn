import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';

/**
 * `x` — leave the game, canon's own exit.
 *
 * GEMAIN.C:2859 mnu_fightsub:
 *
 *   if (sameas(input,"x"))
 *     if (warsptr->cantexit == 0)
 *       { cleartm(usrnum); ...save...; prfmsg(EXIWAR2, shipname);
 *         outsect(ALWAYS,&coord,usrnum,0); warsptr->status = GESTAT_AVAIL; }
 *     else
 *       { prfmsg(CANTEXT); }
 *
 * The port had the RESTRICTION without the action: a client-side disconnect
 * mid-combat destroys the hull (warhupa, already implemented), but there was
 * nothing `cantexit` could refuse, so the only way out was closing the tab.
 * That also stranded a second ship — the select menu is offered on connect
 * only, so switching hulls meant dropping the connection.
 *
 * `cleartm` and the flush both happen in the gateway's normal unboard path,
 * which this result triggers; they are not repeated here.
 */
@Injectable()
export class ExitHandlerService {
  readonly command: Command = {
    keyword: 'x',
    aliases: ['exit', 'quit', 'off'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship),
  };

  private handle(ship: ShipState): CommandResult {
    // `cantexit` is set by every weapon that lands on you and ticks down, so
    // this is canon's cease-fire timer rather than a flag.
    if (ship.cantexit > 0) {
      return {
        lines: [{ text: formatMessage(MessageId.CANTEXT), category: 'system' }],
      };
    }

    // Canon prints nothing to the pilot who leaves — the main menu is what
    // they see next. It announces to the SECTOR instead, so someone you were
    // fighting watches you go rather than losing you off the scan.
    const sector = `sector:${Math.floor(ship.xcoord)}:${Math.floor(ship.ycoord)}`;
    return {
      lines: [],
      broadcasts: [
        {
          room: sector,
          event: 'event.log',
          payload: {
            category: 'system',
            text: formatMessage(MessageId.EXIWAR2, ship.shipname),
          },
          excludeSelf: true,
        },
      ],
      exitGame: true,
    };
  }
}
