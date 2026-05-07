import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { resolveItemKeywordByName } from './_item-keywords';
import { I_GOLD, ITEM_NAMES } from '../../constants/items';

/**
 * Handles `transfer <amt> <itemkw|gold> <target-shipno>` — ship-to-ship cargo/gold transfer.
 *
 * Deviation D1: original cmd_transfer (GECMDS.C:3271) moves cargo between ship and
 * orbiting planet. This version moves cargo between two online ships in the same sector.
 * @see research.md D1
 * @see GECMDS.C:3271 cmd_transfer (canonical — semantics reinterpreted)
 */
@Injectable()
export class TransferHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'transfer',
    aliases: ['tra'],
    minArgs: 3,
    argMissingMessage: formatMessage(MessageId.TRAN_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship, args),
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const amtArg = args[0] ?? '';
    const itemArg = args[1] ?? '';
    const targetArg = args[2] ?? '';

    // Parse amount.
    const amt = parseInt(amtArg, 10);
    if (isNaN(amt) || amt <= 0) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    // Resolve item keyword.
    const itemIndex = resolveItemKeywordByName(itemArg);
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_UNKNOWN_ITEM), category: 'system' }] };
    }

    // Resolve target ship.
    const targetShipno = parseInt(targetArg, 10);
    if (isNaN(targetShipno)) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_FMT), category: 'system' }] };
    }

    // Reject self-transfer.
    if (targetShipno === ship.shipno) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_SELF), category: 'system' }] };
    }

    // Find target in active ships.
    const allShips = this.shipState.findAllShips();
    const target = allShips.find((s) => s.shipno === targetShipno && s.status === 1);
    if (!target) {
      return { lines: [{ text: formatMessage(MessageId.TRAN_OFFLINE), category: 'system' }] };
    }

    // Must be in same sector.
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

    // Atomic transfer — mutate both ships in-place.
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
