import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ITEM_NAMES } from '../../constants/items';
import { planetKey } from '../../planet/planet-state.types';
import { resolveItemKeyword, parseUint32 } from '../validators';

/**
 * Handles the `sell` / `sel` command — sell items at the galactic market (neutral zone plnum=1).
 * Ship cargo decrement happens inside PlanetStateService.sell(); user cash credit is ours.
 * @see GECMDS.C:4103 cmd_sell
 */
@Injectable()
export class SellHandlerService {
  constructor(
    private readonly planetService: PlanetStateService,
    private readonly prisma: PrismaService,
  ) {}

  get command(): Command {
    return {
      keyword: 'sell',
      aliases: ['sel'],
      minArgs: 2,
      argMissingMessage: formatMessage(MessageId.SELLFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.SELL1), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    // Only at neutral zone plnum=1
    if (xsect !== 0 || ysect !== 0 || plnum !== 1) {
      return { lines: [{ text: formatMessage(MessageId.SELL1), category: 'system' }] };
    }

    const qty = parseUint32(args[0] ?? '');
    if (qty === undefined || qty === 0) {
      return { lines: [{ text: formatMessage(MessageId.SELLFMT), category: 'system' }] };
    }

    const itemKeyword = args[1] ?? '';
    const itemIndex = resolveItemKeyword(itemKeyword);
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.SELLFMT), category: 'system' }] };
    }

    const key = planetKey(xsect, ysect, plnum);
    const result = await this.planetService.sell(key, ship.userid, ship.shipno, itemIndex, qty);

    if (!result.ok) {
      switch (result.reason) {
        case 'INSUFFICIENT_CARGO':
          return { lines: [{ text: formatMessage(MessageId.SELL3, ITEM_NAMES[itemIndex]), category: 'system' }] };
        default:
          return { lines: [{ text: formatMessage(MessageId.SELL1), category: 'system' }] };
      }
    }

    // User cash credit — handler's responsibility (ship cargo already decremented by service)
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { increment: result.proceeds } },
    });

    return {
      lines: [
        {
          text: formatMessage(
            MessageId.SELL2,
            result.transferred,
            ITEM_NAMES[itemIndex],
            Number(result.proceeds),
            Number(result.fee),
          ),
          category: 'success',
        },
      ],
    };
  }
}
