import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { UserRepository } from '../../player/user.repository';
import { planetKey } from '../../planet/planet-state.types';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { parseWithdrawAmount } from './helpers/withdraw-amount';

/**
 * Handles the `withdraw` / `with` command — transfer accumulated planet tax to ship owner's cash.
 * @see GECMDS.C:cmd_with
 */
@Injectable()
export class WithdrawHandlerService {
  constructor(
    private readonly planetService: PlanetStateService,
    private readonly users: UserRepository,
  ) {}

  get command(): Command {
    return {
      keyword: 'withdraw',
      aliases: ['with'],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NOT_LANDED), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const state = this.planetService.get(xsect, ysect, plnum);

    if (!state || state.userid !== ship.userid) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NOT_OWNER), category: 'system' }] };
    }

    // The argument was ignored and the whole pool always moved, while the help
    // documents `wit [qty]`. C honours it. @see helpers/withdraw-amount.ts
    const requested = parseWithdrawAmount(args[0], state.tax);
    if (!requested.ok) {
      const msg = requested.reason === 'TOO_MUCH'
        ? formatMessage(MessageId.WTHDR_TOO_MUCH)
        : formatMessage(MessageId.WTHDR_FMT);
      return { lines: [{ text: msg, category: 'system' }] };
    }

    const key = planetKey(xsect, ysect, plnum);
    const result = await this.planetService.withdrawTax(key, ship.userid, requested.amount);

    if (!result.ok) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NOT_OWNER), category: 'system' }] };
    }

    if (result.amount === 0n) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NONE), category: 'system' }] };
    }

    // Credit the user's cash account
    await this.users.addCash(ship.userid, result.amount);

    return {
      lines: [
        {
          text: formatMessage(MessageId.WTHDR_OK, Number(result.amount)),
          category: 'success',
        },
      ],
    };
  }
}
