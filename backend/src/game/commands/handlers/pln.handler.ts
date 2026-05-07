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
    aliases: [],
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
      const name = row.name.padEnd(20).slice(0, 20);
      const xs = String(row.xsect).padStart(2);
      const ys = String(row.ysect).padStart(2);
      const pl = String(row.plnum).padStart(3);
      lines.push({ text: `${name}  (${xs},${ys})  #${pl}`, category: 'success' as const });
    }

    return { lines };
  }
}
