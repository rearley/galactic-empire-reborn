import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { computeBuyOutcome } from '../../planet/planet-trade';
import { isInNeutralZone } from '../../combat/neutral-zone';
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
        // BUY5 is the item-scoped refusal for `pri <qty> <item>`; a bare `pri`
        // named no item, so answering with it told the pilot an item they had
        // not mentioned was unavailable.
        return { lines: [{ text: formatMessage(MessageId.PRICE_NONE), category: 'system' }] };
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

    // Quote through the SAME gate `buy` executes, rather than a second copy of
    // it. The copy had drifted: it checked planet stock for gold at Zygor-3,
    // where the bank is backed by the buyer's own cash, so `pri <n> gol`
    // refused the exact purchase `buy <n> gol` then completed.
    // @see planet/planet-trade.ts computeBuyOutcome
    let usedTons = 0;
    for (let i = 0; i < NUMITEMS; i++) {
      usedTons += Number(ship.items[i] ?? 0n) * ITEM_TONS[i];
    }
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });
    const cash = userRow?.cash ?? 0n;

    const outcome = computeBuyOutcome({
      planet,
      itemIndex,
      requestedQty: qty,
      buyerIsOwner: isOwner,
      buyerCargoCapacityRemaining: (ship.maxTons ?? 1000) - usedTons,
      isNeutralZone: isInNeutralZone(ship),
      buyerCash: cash,
    });

    if (!outcome.ok) {
      const msg =
        outcome.reason === 'SELL_FLAG_OFF' ? MessageId.BUY5
        : outcome.reason === 'CAPACITY_FULL' || outcome.reason === 'WONT_FIT' ? MessageId.BUY8
        : outcome.reason === 'AT_RESERVE' ? MessageId.BUY3
        : MessageId.PRICE_NO_CASH;
      return { lines: [{ text: formatMessage(msg), category: 'system' }] };
    }

    const unitPrice = outcome.unitPrice;
    const totalCost = Number(outcome.totalCost);

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
