import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { resolveItemKeywordByName } from './_item-keywords';
import { ITEM_NAMES } from '../../constants/items';

/**
 * Handles `jettison <amt|ALL> <itemkw>` — permanently removes cargo.
 * Jettisoned items are lost with no recovery path (FR-403).
 *
 * @see GECMDS.C:6102 cmd_jettison
 * @see GECMDS.C:6121 jettison()
 */
@Injectable()
export class JettisonHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'jettison',
    aliases: ['jet'],
    minArgs: 2,
    argMissingMessage: formatMessage(MessageId.JET_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship, args),
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const amtArg = (args[0] ?? '').toUpperCase();
    const itemArg = args[1] ?? '';

    const itemIndex = resolveItemKeywordByName(itemArg);
    if (itemIndex === -1) {
      return { lines: [{ text: formatMessage(MessageId.JET_FMT), category: 'system' }] };
    }

    const currentQty = ship.items[itemIndex] ?? 0n;
    let jettAmt: bigint;

    if (amtArg === 'ALL') {
      jettAmt = currentQty;
    } else {
      const n = parseInt(amtArg, 10);
      if (isNaN(n) || n <= 0) {
        return { lines: [{ text: formatMessage(MessageId.JET_FMT), category: 'system' }] };
      }
      jettAmt = BigInt(n);
    }

    if (jettAmt > currentQty) {
      return { lines: [{ text: formatMessage(MessageId.JET_NO_CARGO), category: 'system' }] };
    }

    if (jettAmt <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.JET_FMT), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[itemIndex] = (s.items[itemIndex] ?? 0n) - jettAmt;
    });

    const itemName = ITEM_NAMES[itemIndex] ?? itemArg;
    return {
      lines: [{ text: formatMessage(MessageId.JET_OK, Number(jettAmt), itemName), category: 'success' }],
    };
  }
}
