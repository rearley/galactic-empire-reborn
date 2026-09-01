import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { MineRegistry } from '../../combat/mine.registry';
import { MineRepository } from '../../combat/mine.repository';
import { cdistance } from '../../combat/combat-math';
import { I_ZIPPER } from '../../constants/items';

/**
 * Handles `zip` — sweeps all mines within the firer's scan range. The firer
 * is NOT damaged (R-3). Per-class scan range is used as the zipper effect
 * radius, mirroring the original.
 *
 * Validations (mirror GECMDS.C:cmd_zipper):
 *   1. firer.items[I_ZIPPER] > 0n → else ZIP_NOAMMO
 *
 * Side effects on success:
 *   For each mine where cdistance(ship, mine) <= scanRange:
 *     MineRepository.delete(mine.id), MineRegistry.remove(mine.id)
 *   ship.items[I_ZIPPER] -= 1n
 *
 * @see GECMDS.C:cmd_zipper
 */
@Injectable()
export class ZipperHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly mineRepo: MineRepository,
    private readonly mineRegistry: MineRegistry,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  readonly command: Command = {
    keyword: 'zip',
    aliases: ['zipper'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): Promise<CommandResult> => {
      return this.handle(ship);
    },
  };

  private async handle(ship: ShipState): Promise<CommandResult> {
    const ammo = ship.items[I_ZIPPER] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.ZIP_NOAMMO), category: 'system' }] };
    }

    let scanRange = 50000;
    try {
      scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    } catch {
      // fall back to default
    }

    // cdistance() is sector-units, scanRange is raw units — C scales the
    // distance by 10_000 before the comparison. Without it the filter matched
    // every mine in the galaxy. @see GECMDS.C:1703-1707
    const inRange = this.mineRegistry
      .getAll()
      .filter((m) => cdistance(ship, m) * 10_000 < scanRange);

    for (const mine of inRange) {
      await this.mineRepo.delete(mine.id);
      this.mineRegistry.remove(mine.id);
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_ZIPPER] = (s.items[I_ZIPPER] ?? 0n) - 1n;
    });

    return {
      lines: [{ text: formatMessage(MessageId.ZIP_SWEPT), category: 'combat' }],
    };
  }
}
