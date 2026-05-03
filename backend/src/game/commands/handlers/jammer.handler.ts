import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { cdistance, jammerCounter } from '../../combat/combat-math';
import { JAMTIME } from '../../constants';
import { I_JAMMER } from '../../constants/items';

/**
 * Handles `jam` — deploys a jammer that interferes with all ships within
 * the carrier's scan range, including the carrier itself (no self-exclusion).
 *
 * Validations (mirror GECMDS.C:cmd_jammer 1593-1651):
 *   1. firer.items[I_JAMMER] > 0n → else JAM_NOAMMO
 *
 * Side effects on success:
 *   For each active ship (including self):
 *     candidate.jammer = jammerCounter(distance, scanRange, JAMTIME)
 *   ship.items[I_JAMMER] -= 1n
 *
 * @see GECMDS.C:cmd_jammer 1593-1651
 */
@Injectable()
export class JammerHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  readonly command: Command = {
    keyword: 'jam',
    aliases: ['jammer'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship);
    },
  };

  private handle(ship: ShipState): CommandResult {
    const ammo = ship.items[I_JAMMER] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.JAM_NOAMMO), category: 'system' }] };
    }

    let scanRange = 50000;
    try {
      scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    } catch {
      // fall back
    }

    for (const candidate of this.shipState.findAllShips()) {
      const dist = cdistance(ship, candidate);
      const value = jammerCounter(dist, scanRange, JAMTIME);
      this.shipState.mutate(candidate.userid, candidate.shipno, (s) => {
        s.jammer = value;
      });
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_JAMMER] = (s.items[I_JAMMER] ?? 0n) - 1n;
    });

    return {
      lines: [{ text: formatMessage(MessageId.JAM_FIRED), category: 'combat' }],
    };
  }
}
