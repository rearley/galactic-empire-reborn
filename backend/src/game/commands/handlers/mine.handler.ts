import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { NO_CHANNEL } from '../../ship/ship-channel.registry';
import { MineRegistry } from '../../combat/mine.registry';
import { MineRepository, MineTableFullError } from '../../combat/mine.repository';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { I_MINE } from '../../constants/items';
import { FIRETICKS, MINE_TIMER_MIN, MINE_TIMER_MAX, USERMINES } from '../../constants';

/** Default mine timer when no arg supplied — 30 ticks ≈ 3 minutes at 6s tick. */
const MINE_INITIAL_TIMER = 30;

/**
 * Handles `min [timer]` — deploys a mine at the firer's current position.
 *
 * Validations (mirror GECMDS.C:1722-1781 cmd_mine):
 *   1. ship class has mine launcher (hasMine) → else MIN_NOMINE
 *   2. not in neutral zone → else MIN_NEUTRAL  (C order: GECMDS.C:1727-1746)
 *   3. firer.cloak === 0 → else MIN_CLOAK (plain refusal, no self-zap)
 *   4. firer.items[I_MINE] > 0n → else MIN_NOAMMO
 *   5. timer arg optional; if given must be in [MINE_TIMER_MIN, MINE_TIMER_MAX] → else NUMOOR
 *   6. live-mine count by deployer < USERMINES → else MIN_FULL
 *
 * Side effects on success:
 *   MineRepository.create({ channel, timer, xcoord, ycoord, deployedBy })
 *   MineRegistry.add(newMine)
 *   ship.items[I_MINE] -= 1n
 *   ship.cantexit = FIRETICKS
 *
 * @see GECMDS.C:1722 cmd_mine
 */
@Injectable()
export class MineHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly mineRepo: MineRepository,
    private readonly mineRegistry: MineRegistry,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  readonly command: Command = {
    keyword: 'min',
    aliases: ['mine'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> => {
      return this.handle(ship, args);
    },
  };

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (!this.shipClassCache.get(ship.shpclass)?.hasMine) {
      return { lines: [{ text: formatMessage(MessageId.MIN_NOMINE), category: 'system' }] };
    }

    // C order (GECMDS.C:1727-1746): neutral-zone check PRECEDES cloak check.
    if (isInNeutralZone(ship)) {
      return { lines: [{ text: formatMessage(MessageId.MIN_NEUTRAL), category: 'system' }] };
    }

    if (ship.cloak > 0) {
      return { lines: [{ text: formatMessage(MessageId.MIN_CLOAK), category: 'system' }] };
    }

    const ammo = ship.items[I_MINE] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.MIN_NOAMMO), category: 'system' }] };
    }

    let timer = MINE_INITIAL_TIMER;
    if (args[0] !== undefined) {
      const parsed = parseInt(args[0], 10);
      if (isNaN(parsed) || parsed < MINE_TIMER_MIN || parsed > MINE_TIMER_MAX) {
        return { lines: [{ text: formatMessage(MessageId.NUMOOR, MINE_TIMER_MIN, MINE_TIMER_MAX), category: 'system' }] };
      }
      timer = parsed;
    }

    if (this.mineRegistry.countByDeployer(ship.userid) >= USERMINES) {
      return { lines: [{ text: formatMessage(MessageId.MIN_FULL), category: 'system' }] };
    }

    // The galaxy-wide table can be full even when this captain is under their
    // own USRMINES cap. Canon's `laymine` simply finds no free slot, returns 0,
    // and the caller prints MINE2 — nothing is spent and no combat lock is set,
    // because both of those live inside the branch that found a slot.
    // Letting the rejection escape rendered "Internal error processing command."
    // @see GECMDS.C:1772-1780 the caller, :1805-1818 laymine
    let mine: Awaited<ReturnType<MineRepository['create']>>;
    try {
      mine = await this.mineRepo.create({
        channel: ship.channel ?? NO_CHANNEL,
        timer,
        xcoord: ship.xcoord,
        ycoord: ship.ycoord,
        deployedBy: ship.userid,
      });
    } catch (err: unknown) {
      if (err instanceof MineTableFullError) {
        return { lines: [{ text: formatMessage(MessageId.MIN_JAMMED), category: 'system' }] };
      }
      throw err;
    }

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
      s.cantexit = FIRETICKS;
    });

    return {
      lines: [{ text: formatMessage(MessageId.MIN_DEPLOYED, timer), category: 'combat' }],
    };
  }
}
