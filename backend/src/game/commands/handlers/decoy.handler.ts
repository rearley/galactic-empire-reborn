import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { DECOYTIME } from '../../constants';
import { I_DECOY } from '../../constants/items';

/**
 * Handles `dec` — deploys a decoy in the lowest free `decout[]` slot.
 *
 * Validations (mirror GECMDS.C:cmd_decoy):
 *   1. firer.items[I_DECOY] > 0n → else DEC_NOAMMO
 *
 * Side effects on success:
 *   ship.decout[i] = DECOYTIME for the lowest i where decout[i] === 0/undefined
 *   ship.items[I_DECOY] -= 1n
 *
 * @see GECMDS.C:cmd_decoy
 */
@Injectable()
export class DecoyHandlerService {
  constructor(private readonly shipState: ShipStateService) {}

  readonly command: Command = {
    keyword: 'dec',
    aliases: ['decoy'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship);
    },
  };

  private handle(ship: ShipState): CommandResult {
    const ammo = ship.items[I_DECOY] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.DEC_NOAMMO), category: 'system' }] };
    }

    let slot = -1;
    for (let i = 0; i < ship.decout.length; i++) {
      if ((ship.decout[i] ?? 0) === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      slot = ship.decout.length;
    }

    const targetSlot = slot;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      while (s.decout.length <= targetSlot) s.decout.push(0);
      s.decout[targetSlot] = DECOYTIME;
      s.items[I_DECOY] = (s.items[I_DECOY] ?? 0n) - 1n;
    });

    return {
      lines: [{ text: formatMessage(MessageId.DEC_DEPLOYED), category: 'combat' }],
    };
  }
}
