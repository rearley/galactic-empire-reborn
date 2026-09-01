import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ITEM_NAMES, ITEM_TONS, NUMITEMS } from '../../constants/items';
import { planetKey } from '../../planet/planet-state.types';
import { resolveItemKeyword, parseUint32 } from '../validators';

/**
 * Handles the `buy` command — purchase items from the planet currently landed on.
 * @see GECMDS.C:4201 cmd_buy
 */
@Injectable()
export class BuyHandlerService {
  constructor(
    private readonly planetService: PlanetStateService,
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
  ) {}

  get command(): Command {
    return {
      keyword: 'buy',
      aliases: [],
      minArgs: 2,
      argMissingMessage: formatMessage(MessageId.BUYFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.BUY1), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const state = this.planetService.get(xsect, ysect, plnum);

    if (!state) {
      return { lines: [{ text: formatMessage(MessageId.BUY1), category: 'system' }] };
    }

    // Password gate for non-owners
    if (state.userid !== null && state.userid !== ship.userid) {
      const pwd = state.password;
      if (pwd && pwd !== 'none') {
        if (pwd === 'team') {
          if (state.teamcode !== 0n) {
            return { lines: [{ text: formatMessage(MessageId.BUYPAS3), category: 'system' }] };
          }
        } else {
          // Password required but not provided as arg[2]
          const providedPwd = args[2]?.trim() ?? '';
          if (providedPwd !== pwd) {
            return { lines: [{ text: formatMessage(MessageId.BUYPAS1), category: 'system' }] };
          }
        }
      }
    }

    const qty = parseUint32(args[0] ?? '');
    if (qty === undefined || qty === 0) {
      return { lines: [{ text: formatMessage(MessageId.BUYFMT), category: 'system' }] };
    }

    const itemKeyword = args[1] ?? '';
    const itemIndex = resolveItemKeyword(itemKeyword);
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.BUYFMT), category: 'system' }] };
    }

    // Compute remaining cargo capacity
    const items = ship.items;
    let usedTons = 0;
    for (let i = 0; i < NUMITEMS; i++) {
      usedTons += Number(items[i] ?? 0n) * ITEM_TONS[i];
    }
    const capacityRemaining = (ship.maxTons ?? 1000) - usedTons;

    // C clamps a negative balance to zero on entry to cmd_buy, then gates the
    // transfer on `price(item,amt) <= waruptr->cash`. @see GECMDS.C:4207-4209, 4333
    const buyer = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });
    let buyerCash = buyer?.cash ?? 0n;
    if (buyerCash < 0n) {
      buyerCash = 0n;
      await this.prisma.user.update({ where: { userid: ship.userid }, data: { cash: 0n } });
    }

    const key = planetKey(xsect, ysect, plnum);
    const result = await this.planetService.buy(
      key,
      ship.userid,
      itemIndex,
      qty,
      capacityRemaining,
      buyerCash,
    );

    if (!result.ok) {
      switch (result.reason) {
        case 'SELL_FLAG_OFF':
          return { lines: [{ text: formatMessage(MessageId.BUY5), category: 'system' }] };
        case 'AT_RESERVE':
          return { lines: [{ text: formatMessage(MessageId.BUY3), category: 'system' }] };
        case 'CAPACITY_FULL':
          return { lines: [{ text: formatMessage(MessageId.BUY4), category: 'system' }] };
        case 'WONT_FIT':
          return { lines: [{ text: formatMessage(MessageId.BUY8), category: 'system' }] };
        case 'INSUFFICIENT_FUNDS':
          return { lines: [{ text: formatMessage(MessageId.PRICE_NO_CASH), category: 'system' }] };
        default:
          return { lines: [{ text: formatMessage(MessageId.BUY1), category: 'system' }] };
      }
    }

    // Ship-side: add items
    this.shipService.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) + BigInt(result.transferred);
    });

    // Deduct cash from user
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { decrement: result.totalCost } },
    });

    return {
      lines: [
        {
          text: formatMessage(
            MessageId.BUY2,
            result.transferred,
            ITEM_NAMES[itemIndex],
            result.unitPrice,
            Number(result.totalCost),
          ),
          category: 'success',
        },
      ],
    };
  }
}
