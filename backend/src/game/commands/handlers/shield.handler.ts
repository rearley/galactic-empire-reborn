import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { SHIELDDM, SHMINPWR } from '../../constants';

/**
 * Handles `shi up|dn` — manually raises or lowers shields.
 *
 * Raising has five preconditions, checked in C's order (GECMDS.C:3114-3170);
 * lowering has none, since `shielddn()` is called directly. The port used to
 * set `shieldstat = 1` unconditionally, which mattered most for the last gate:
 * a pilot whose shields had just been blown could re-raise them immediately,
 * so there was no cost to losing them and sustained fire bought nothing.
 *
 * The tick engine still never auto-raises shields (outside the `autoShield`
 * convenience) — the pilot asks for them.
 *
 * @see GECMDS.C:3114 cmd_shields
 * @see GEFUNCS.C:2409 shieldup — flips shieldstat only, grants no charge
 */
@Injectable()
export class ShieldHandlerService {
  constructor(private readonly shipClassCache: ShipClassCacheService) {}

  get command(): Command {
    return {
      keyword: 'shi',
      aliases: ['shield'],
      minArgs: 1,
      argMissingMessage: formatMessage(MessageId.SHI_FMT),
      handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
        this.handle(ship, args),
    };
  }

  private handle(ship: ShipState, args: string[]): CommandResult {
    const sub = (args[0] ?? '').toLowerCase();

    if (sub === 'dn' || sub === 'down') {
      ship.shieldstat = 0;
      ship.dirty = true;
      return { lines: [{ text: formatMessage(MessageId.SHI_DN), category: 'success' }] };
    }

    if (sub !== 'up') {
      return { lines: [{ text: formatMessage(MessageId.SHI_FMT), category: 'system' }] };
    }

    const refuse = (id: MessageId): CommandResult => ({
      lines: [{ text: formatMessage(id), category: 'system' }],
    });

    let maxShields = 0;
    try {
      maxShields = this.shipClassCache.getMaxShields(ship.shpclass);
    } catch {
      // Unknown class: treat as no generator, the same as max_shlds == 0.
    }
    if (maxShields === 0) return refuse(MessageId.SHIELD0);
    if (ship.where === 1) return refuse(MessageId.SHLD1);
    if (ship.shieldtype === 0) return refuse(MessageId.SHLD2);
    if (ship.energy <= SHMINPWR) return refuse(MessageId.SHNOPWR);
    if (ship.shieldstat === SHIELDDM) return refuse(MessageId.SHNORPR);

    ship.shieldstat = 1;
    ship.dirty = true;
    return { lines: [{ text: formatMessage(MessageId.SHI_UP), category: 'success' }] };
  }
}
