import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { planetKey } from '../../planet/planet-state.types';
import { resolveItemKeywordByName } from './_item-keywords';
import { ITEM_SHORT_KEYWORDS, resolveItemKeyword } from '../validators';
import { I_GOLD, ITEM_NAMES, ITEM_TONS, NUMITEMS } from '../../constants/items';

/**
 * Handles `transfer` / `tra`:
 *   tra down <qty> <item>   — ship cargo → orbited planet  @see GECMDS.C:3300 trans_down
 *   tra up   <qty> <item>   — planet surface → ship cargo  @see GECMDS.C:3354 trans_up
 *   tra <qty> <item> <shipno> — ship-to-ship (deviation D1)
 */
@Injectable()
export class TransferHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly planetState: PlanetStateService,
  ) {}

  readonly command: Command = {
    keyword: 'transfer',
    aliases: ['tra'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.TRAN_FMT),
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> | CommandResult =>
      this.handle(ship, args, ctx),
  };

  private handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> | CommandResult {
    const first = (args[0] ?? '').toLowerCase();

    if (first === 'down') return this.handleDown(ship, args.slice(1));
    if (first === 'up')   return this.handleUp(ship, args.slice(1));
    return this.handleShipToShip(ship, args);
  }

  /**
   * tra down <qty> <item> — transfer from ship to orbited planet.
   * @see GECMDS.C:3300 trans_down
   */
  private async handleDown(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_ORBIT), category: 'system' }] };
    }

    const qty = parseInt(args[0] ?? '', 10);
    if (isNaN(qty) || qty <= 0) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    const itemIndex = resolveItemKeyword(args[1] ?? '');
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    const have = ship.items[itemIndex] ?? 0n;
    if (have < BigInt(qty)) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NO_CARGO), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const key = planetKey(xsect, ysect, plnum);
    const planet = this.planetState.get(xsect, ysect, plnum);
    if (!planet) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_ORBIT), category: 'system' }] };
    }

    const result = await this.planetState.depositToPlanet(key, ship.userid, itemIndex, BigInt(qty));
    if (!result.ok) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_OWNER), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) - BigInt(qty);
    });

    return {
      lines: [{
        text: formatMessage(MessageId.TRAN_DOWN_OK, qty, ITEM_NAMES[itemIndex], planet.name),
        category: 'success',
      }],
    };
  }

  /**
   * tra up <qty> <item> — transfer from planet to ship.
   * @see GECMDS.C:3354 trans_up
   */
  private async handleUp(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_ORBIT), category: 'system' }] };
    }

    const qty = parseInt(args[0] ?? '', 10);
    if (isNaN(qty) || qty <= 0) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    const itemIndex = resolveItemKeyword(args[1] ?? '');
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    // Cargo capacity check
    let usedTons = 0;
    for (let i = 0; i < NUMITEMS; i++) {
      usedTons += Number(ship.items[i] ?? 0n) * ITEM_TONS[i];
    }
    const maxTons = 1000;
    const freeTons = maxTons - usedTons;
    if (freeTons < qty * ITEM_TONS[itemIndex]) {
      return { lines: [{ text: formatMessage(MessageId.BUY8), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const key = planetKey(xsect, ysect, plnum);
    const planet = this.planetState.get(xsect, ysect, plnum);
    if (!planet) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_ORBIT), category: 'system' }] };
    }

    const result = await this.planetState.withdrawFromPlanet(key, ship.userid, itemIndex, BigInt(qty));
    if (!result.ok) {
      if (result.reason === 'INSUFFICIENT') {
        return { lines: [{ text: formatMessage(MessageId.TRAN_PLANET_LOW), category: 'system' }] };
      }
      return { lines: [{ text: formatMessage(MessageId.TRAN_NOT_OWNER), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) + BigInt(qty);
    });

    return {
      lines: [{
        text: formatMessage(MessageId.TRAN_UP_OK, qty, ITEM_NAMES[itemIndex], planet.name),
        category: 'success',
      }],
    };
  }

  /**
   * tra <qty> <item> <shipno> — ship-to-ship transfer.
   */
  private handleShipToShip(ship: ShipState, args: string[]): CommandResult {
    if (args.length < 3) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    const amtArg = args[0] ?? '';
    const itemArg = args[1] ?? '';
    const targetArg = args[2] ?? '';

    const amt = parseInt(amtArg, 10);
    if (isNaN(amt) || amt <= 0) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    const itemIndex = resolveItemKeywordByName(itemArg);
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_UNKNOWN_ITEM), category: 'system' }] };
    }

    const targetShipno = parseInt(targetArg, 10);
    if (isNaN(targetShipno)) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    if (targetShipno === ship.shipno) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_SELF), category: 'system' }] };
    }

    const allShips = this.shipState.findAllShips();
    const target = allShips.find((s) => s.shipno === targetShipno && s.status === 1);
    if (!target) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_OFFLINE), category: 'system' }] };
    }

    const srcX = Math.floor(ship.xcoord);
    const srcY = Math.floor(ship.ycoord);
    const tgtX = Math.floor(target.xcoord);
    const tgtY = Math.floor(target.ycoord);
    if (srcX !== tgtX || srcY !== tgtY) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_SECTOR), category: 'system' }] };
    }

    const amtBig = BigInt(amt);
    const sourceQty = ship.items[itemIndex] ?? 0n;

    if (sourceQty < amtBig) {
      const msg = itemIndex === I_GOLD
        ? formatMessage(MessageId.TRAN_NO_GOLD)
        : formatMessage(MessageId.TRAN_NO_CARGO);
      return { lines: [{ text: msg, category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) - amtBig;
    });
    this.shipState.mutate(target.userid, target.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) + amtBig;
    });

    const itemName = ITEM_NAMES[itemIndex] ?? itemArg;

    return {
      lines: [{ text: formatMessage(MessageId.TRAN_OK, amt, itemName, target.shipname), category: 'success' }],
      broadcasts: [
        {
          room: `user:${target.userid}`,
          event: 'event.log',
          payload: {
            category: 'info',
            text: formatMessage(MessageId.TRAN_RECEIVED, ship.shipname, amt, itemName),
          },
        },
      ],
    };
  }
}
