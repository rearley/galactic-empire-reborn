import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { MineRegistry } from '../../combat/mine.registry';
import { MineRepository } from '../../combat/mine.repository';
import { I_MINE } from '../../constants/items';

/** Initial mine timer (game-balance default — 30 ticks ≈ 3 minutes at 6s tick). */
const MINE_INITIAL_TIMER = 30;

/**
 * Handles `min` — deploys a mine at the firer's current position.
 *
 * Validations (mirror GECMDS.C:cmd_mine):
 *   1. firer.items[I_MINE] > 0n → else MIN_NOAMMO
 *
 * Side effects on success:
 *   MineRepository.create({ channel: ship.shipno, timer: 30,
 *     xcoord: ship.xcoord, ycoord: ship.ycoord, deployedBy: ship.userid })
 *   MineRegistry.add(newMine)
 *   ship.items[I_MINE] -= 1n
 *
 * @see GECMDS.C:cmd_mine
 */
@Injectable()
export class MineHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly mineRepo: MineRepository,
    private readonly mineRegistry: MineRegistry,
  ) {}

  readonly command: Command = {
    keyword: 'min',
    aliases: ['mine'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): Promise<CommandResult> => {
      return this.handle(ship);
    },
  };

  private async handle(ship: ShipState): Promise<CommandResult> {
    const ammo = ship.items[I_MINE] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.MIN_NOAMMO), category: 'system' }] };
    }

    const mine = await this.mineRepo.create({
      channel: ship.shipno,
      timer: MINE_INITIAL_TIMER,
      xcoord: ship.xcoord,
      ycoord: ship.ycoord,
      deployedBy: ship.userid,
    });

    this.mineRegistry.add({
      id: mine.id,
      channel: mine.channel,
      timer: mine.timer,
      xcoord: mine.xcoord,
      ycoord: mine.ycoord,
      deployedBy: mine.deployedBy,
    });

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_MINE] = (s.items[I_MINE] ?? 0n) - 1n;
    });

    return {
      lines: [{ text: formatMessage(MessageId.MIN_DEPLOYED), category: 'combat' }],
    };
  }
}
