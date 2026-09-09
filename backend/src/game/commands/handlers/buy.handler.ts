import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ITEM_NAMES, ITEM_TONS, NUMITEMS } from '../../constants/items';
import { planetKey } from '../../planet/planet-state.types';
import { decideTradeAccess } from '../../planet/trade-access';
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

    // Ownership and password gates — C runs these before any price or stock is
    // consulted. @see GECMDS.C:4232-4246, 4322
    const access = decideTradeAccess(
      state,
      ship.userid,
      ship.teamcode ?? 0n,
      args[2]?.trim() || undefined,
    );
    if (!access.ok) {
      const message =
        access.reason === 'NO_OWNER'
          ? MessageId.BUY7
          : access.reason === 'WRONG_TEAM'
            ? MessageId.BUYPAS3
            : MessageId.BUYPAS1;
      return { lines: [{ text: formatMessage(message), category: 'system' }] };
    }
    const welcome = access.welcome === true;

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
      // The debit re-checks the balance in the same statement that decrements
      // it, so Postgres enforces affordability rather than the scheduler.
      // `buyerCash` above was read before the planet lock and twenty concurrent
      // buys all saw the same value. @see docs/audits/2026-09-09-security-review.md M1
      (totalCost) => this.debitBuyer(ship.userid, totalCost),
    );

    if (!result.ok) {
      switch (result.reason) {
        case 'SELL_FLAG_OFF':
          return { lines: [{ text: formatMessage(MessageId.BUY5), category: 'system' }] };
        // BUY3 names the number actually for sale. The old wording blamed the
        // planet's "reserve" — zero on every neutral-zone planet, and there
        // was no way from inside the game to learn the real limit.
        // @see GECMDS.C:4380-4381
        case 'AT_RESERVE':
          return {
            lines: [
              {
                text: formatMessage(MessageId.BUY3, result.available, ITEM_NAMES[itemIndex]),
                category: 'system',
              },
            ],
          };
        // Every `chkweight` failure is BUY8 in C — a completely full hold is
        // not a different message. @see GECMDS.C:4328
        case 'CAPACITY_FULL':
          return { lines: [{ text: formatMessage(MessageId.BUY8), category: 'system' }] };
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

    const lines: CommandResult['lines'] = [];
    // BUYPAS4 — C greets a team-mate before the purchase confirmation.
    if (welcome) {
      lines.push({ text: formatMessage(MessageId.BUYPAS4), category: 'info' });
    }

    return {
      lines: [
        ...lines,
        {
          // BUY9 is the purchase confirmation C prints; PRICE1 is the same
          // sentence in the future tense for `pri`. @see GECMDS.C:4353-4361
          text: formatMessage(
            MessageId.BUY9,
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

  /**
   * Take `totalCost` from the buyer, but only if they still have it.
   *
   * `updateMany` with the balance in the WHERE clause makes the check and the
   * decrement one statement, so Postgres refuses an overdraft no matter how
   * many commands are in flight. The old code read the balance, awaited the
   * planet transaction, then decremented unconditionally — twenty concurrent
   * `buy` packets all read 1,000 credits, all passed, and all committed,
   * leaving −19,000. The canon clamp at the top of this handler
   * (GECMDS.C:4205-4207) then wrote that debt off on the next purchase.
   *
   * @returns false when the buyer could not afford it; nothing is written.
   * @see test/integration/economy-race-cash.spec.ts
   */
  private async debitBuyer(userid: string, totalCost: bigint): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { userid, cash: { gte: totalCost } },
      data: { cash: { decrement: totalCost } },
    });
    return count > 0;
  }

}
