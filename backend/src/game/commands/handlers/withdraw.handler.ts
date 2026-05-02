import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { planetKey } from '../../planet/planet-state.types';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles the `withdraw` / `with` command — transfer accumulated planet tax to ship owner's cash.
 * @see GECMDS.C:cmd_with
 */
@Injectable()
export class WithdrawHandlerService {
  constructor(
    private readonly planetService: PlanetStateService,
    private readonly prisma: PrismaService,
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

  private async handle(ship: ShipState, _args: string[], _ctx: CommandContext): Promise<CommandResult> {
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

    const key = planetKey(xsect, ysect, plnum);
    const result = await this.planetService.withdrawTax(key, ship.userid);

    if (!result.ok) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NOT_OWNER), category: 'system' }] };
    }

    if (result.amount === 0n) {
      return { lines: [{ text: formatMessage(MessageId.WTHDR_NONE), category: 'system' }] };
    }

    // Credit the user's cash account
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { increment: result.amount } },
    });

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
