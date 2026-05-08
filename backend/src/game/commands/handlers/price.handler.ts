import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BASEPRICE, ITEM_NAMES, ITEM_TONS, NUMITEMS } from '../../constants/items';
import { ITEM_SHORT_KEYWORDS, resolveItemKeyword, parseUint32 } from '../validators';

/**
 * Handles the `pri` command — price quote at the currently orbited planet.
 *
 * Read-only. No cash debit, no inventory transfer.
 * Bare `pri` lists every sellable item; `pri N <item>` runs the full
 * buy-precondition ladder (BUY1/BUY7/BUY5/BUY4/BUY8/BUY3/BUY2) and quotes.
 *
 * @see GECMDS.C:4284 cmd_price
 */
@Injectable()
export class PriceHandlerService {
  constructor(
    private readonly planetService: PlanetStateService,
    private readonly prisma: PrismaService,
  ) {}

  readonly command: Command = {
    keyword: 'pri',
    aliases: ['price'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args, ctx),
  };

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    // BUY1: must be in orbit.
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.BUY1), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planet = this.planetService.get(xsect, ysect, plnum);

    if (!planet) {
      return { lines: [{ text: formatMessage(MessageId.BUY1), category: 'system' }] };
    }

    const isOwner = planet.userid !== null && planet.userid === ship.userid;

    // Bare `pri` — list every sellable item with keyword hint. @see GECMDS.C:4284 no-args loop
    if (args.length === 0) {
      const lines: Array<{ text: string; category: 'success' }> = [];
      for (let i = 0; i < NUMITEMS; i++) {
        const item = planet.items[i];
        if (item.sell || isOwner) {
          const unitPrice = isOwner ? BASEPRICE[i] : item.markup2a;
          const kw = ITEM_SHORT_KEYWORDS[i] ?? '???';
          lines.push({
            text: `${ITEM_NAMES[i]} (${kw})  ${unitPrice} cr`,
            category: 'success',
          });
        }
      }
      if (lines.length === 0) {
        return { lines: [{ text: formatMessage(MessageId.BUY5), category: 'system' }] };
      }
      return { lines };
    }

    // Quoted form: `pri <amount> <itemkw>` — PRICEFMT if wrong shape.
    if (args.length < 2) {
      return { lines: [{ text: formatMessage(MessageId.PRICEFMT), category: 'system' }] };
    }

    const qty = parseUint32(args[0] ?? '');
    if (qty === undefined) {
      return { lines: [{ text: formatMessage(MessageId.PRICEFMT), category: 'system' }] };
    }
    const itemIndex = resolveItemKeyword(args[1] ?? '');
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.PRICEFMT), category: 'system' }] };
    }

    // BUY5: amount must be > 0.
    if (qty === 0) {
      return { lines: [{ text: formatMessage(MessageId.BUY5), category: 'system' }] };
    }

    const item = planet.items[itemIndex];

    // Item must be for sale or requester is owner.
    // Unowned neutral-zone planets with explicit sell flags are open shops.
    if (!isOwner && !item.sell) {
      return { lines: [{ text: formatMessage(MessageId.BUY5), category: 'system' }] };
    }

    // BUY8: cargo capacity sufficient for amount.
    let usedTons = 0;
    for (let i = 0; i < NUMITEMS; i++) {
      usedTons += Number(ship.items[i] ?? 0n) * ITEM_TONS[i];
    }
    const capacityRemaining = (ship.maxTons ?? 1000) - usedTons;
    if (capacityRemaining < qty * ITEM_TONS[itemIndex]) {
      return { lines: [{ text: formatMessage(MessageId.BUY8), category: 'system' }] };
    }

    // BUY3: sufficient stock (subtract reserve for foreigners).
    const available = isOwner
      ? Number(item.qty)
      : Math.max(0, Number(item.qty) - item.reserve);
    if (available < qty) {
      return { lines: [{ text: formatMessage(MessageId.BUY3), category: 'system' }] };
    }

    const unitPrice = isOwner ? BASEPRICE[itemIndex] : item.markup2a;
    const totalCost = unitPrice * qty;

    // BUY2 (cash check): captain has enough cash. @see GECMDS.C cmd_price step f
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });
    const cash = userRow?.cash ?? 0n;
    if (cash < BigInt(totalCost)) {
      return { lines: [{ text: formatMessage(MessageId.PRICE_NO_CASH), category: 'system' }] };
    }

    return {
      lines: [
        {
          text: formatMessage(MessageId.PRICE1, qty, ITEM_NAMES[itemIndex], unitPrice, totalCost),
          category: 'success',
        },
      ],
    };
  }
}
