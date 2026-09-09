import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { resolveTransferTarget, receiverFreeTons } from './helpers/transfer-target';
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

    // The cargo check and the decrement both happen inside the planet lock now,
    // so the synchronous `have < qty` test above is a fast path rather than the
    // guarantee. @see docs/audits/2026-09-09-security-review.md M2
    const result = await this.planetState.depositToPlanet(
      key, ship.userid, ship.shipno, itemIndex, BigInt(qty),
    );
    if (!result.ok) {
      if (result.reason === 'INSUFFICIENT_CARGO') {
        return { lines: [{ text: formatMessage(MessageId.TRAN_NO_CARGO), category: 'system' }] };
      }
      // TRANSFR4 — "We don't own this planet." Canon's refusal for the down
      // leg; the port answered TRANSFR3, "We are not in orbit", which is a
      // false statement about a ship that is standing in orbit.
      // @see GECMDS.C:3348
      return { lines: [{ text: formatMessage(MessageId.TRAN_DOWN_NOT_OWNER), category: 'system' }] };
    }

    return {
      lines: [{
        text: formatMessage(MessageId.TRAN_DOWN_OK, qty, ITEM_NAMES[itemIndex]),
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
    const freeTons = (ship.maxTons ?? 1000) - usedTons;
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
      // TRANSUP4 — "We don't own this planet." @see GECMDS.C:3411
      return { lines: [{ text: formatMessage(MessageId.TRAN_UP_NOT_OWNER), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) + BigInt(qty);
    });

    return {
      lines: [{
        text: formatMessage(MessageId.TRAN_UP_OK, qty, ITEM_NAMES[itemIndex]),
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

    // A NAME addresses any captain; a bare number means a hull in YOUR fleet.
    // Matching `s.shipno` across every ship could not name another captain at
    // all — shipno is a per-user index — and returned whichever ship sat first
    // in the map. @see helpers/transfer-target.ts
    const resolved = resolveTransferTarget(targetArg, ship, this.shipState.findAllShips());
    if (!resolved.ok) {
      const msg =
        resolved.reason === 'SELF' ? MessageId.TRAN_SELF
        : resolved.reason === 'SECTOR' ? MessageId.TRAN_SECTOR
        : MessageId.TRAN_OFFLINE;
      return { lines: [{ text: formatMessage(msg), category: 'system' }] };
    }
    const target = resolved.ship;

    const amtBig = BigInt(amt);
    const sourceQty = ship.items[itemIndex] ?? 0n;

    // The receiving hold was never checked, so a trader pushed a 1,000-ton
    // Interceptor to 1,018.5 tons. The planet path has always checked the
    // sender's hold; this checks the other side of the same transfer.
    const freeTons = receiverFreeTons(target);
    if (amt * ITEM_TONS[itemIndex] > freeTons) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_NO_ROOM, target.shipname), category: 'system' }] };
    }

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
