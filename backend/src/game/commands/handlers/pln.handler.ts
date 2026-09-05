import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Handles the `pln` command — list all planets owned by the current captain.
 *
 * Read-only. No state mutation, no DB writes.
 * @see GECMDS.C cmd_pln
 */
@Injectable()
export class PlnHandlerService {
  constructor(private readonly prisma: PrismaService) {}

  readonly command: Command = {
    keyword: 'pln',
    aliases: ['pla'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship),
  };

  private async handle(ship: ShipState): Promise<CommandResult> {
    const rows = await this.prisma.planet.findMany({
      where: { userid: ship.userid },
      select: { name: true, xsect: true, ysect: true, plnum: true },
      orderBy: { plnum: 'asc' },
    });

    if (rows.length === 0) {
      return { lines: [{ text: formatMessage(MessageId.PLN_NONE), category: 'system' }] };
    }

    const lines = [{ text: formatMessage(MessageId.PLN_HEADER), category: 'success' as const }];
    for (const row of rows) {
      // cmd_planet writes the row with a raw prf rather than a message id:
      //   prf("%-20s %5d %5d  %d \r", name, xsect, ysect, plnum)
      // That is still canon, and the columns it produces line up under
      // PLAMSG1's "Planet Name         sector planet" heading. The port's own
      // "(x,y) #nnn" shape did not.
      lines.push({
        text: formatMessage(MessageId.PLN_ROW, row.name.slice(0, 20), row.xsect, row.ysect, row.plnum),
        category: 'success' as const,
      });
    }

    return { lines };
  }
}
