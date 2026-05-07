import { Inject, Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { CLOAK_ENERGY_USE } from '../cloak.config';
import { CLOAK_RAMP_INIT } from '../_ship-management-constants';

/**
 * Handles `cloak <on|off>` — toggles the cloaking device.
 *
 * On `cloak on`:
 *  - Rejects if already cloaked, damaged, hyperspace, or insufficient energy.
 *  - Sets cloak = CLOAK_RAMP_INIT (1) and debits CLOAK_ENERGY_USE.
 *  - ShipManagementTickService ramps to 2 then 10 over two physics ticks.
 *
 * On `cloak off`:
 *  - Rejects if not cloaked.
 *  - Sets cloak = 0 and broadcasts sector decloaked event.
 *
 * @see GECMDS.C:3188 cmd_cloak
 * @see GEFUNCS.C:1366 cloakstat — ramp/drain handled in ShipManagementTickService
 */
@Injectable()
export class CloakHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    @Inject(CLOAK_ENERGY_USE) private readonly cloakEnergyUse: number,
  ) {}

  readonly command: Command = {
    keyword: 'cloak',
    aliases: ['clo'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.CLOAK_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult =>
      this.handle(ship, args),
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    const sub = args[0]?.toLowerCase() ?? '';

    if (sub === 'on') {
      return this.handleOn(ship);
    } else if (sub === 'off') {
      return this.handleOff(ship);
    }
    return { lines: [{ text: formatMessage(MessageId.CLOAK_FMT), category: 'system' }] };
  }

  private handleOn(ship: ShipState): CommandResult {
    if (ship.cloak < 0) {
      return { lines: [{ text: formatMessage(MessageId.CLOAK_DAMAGED), category: 'system' }] };
    }
    if (ship.cloak > 0) {
      return { lines: [{ text: formatMessage(MessageId.CLOAK_ALREADY_ON), category: 'system' }] };
    }
    if (ship.where === 1) {
      return { lines: [{ text: formatMessage(MessageId.CLOAK_HYPERSPACE), category: 'system' }] };
    }
    if (ship.energy <= this.cloakEnergyUse) {
      return { lines: [{ text: formatMessage(MessageId.CLOAK_NO_ENERGY), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.cloak = CLOAK_RAMP_INIT;
      s.energy -= this.cloakEnergyUse;
    });

    return { lines: [{ text: formatMessage(MessageId.CLOAK_ENGAGED), category: 'success' }] };
  }

  private handleOff(ship: ShipState): CommandResult {
    if (ship.cloak <= 0) {
      return { lines: [{ text: formatMessage(MessageId.CLOAK_ALREADY_OFF), category: 'system' }] };
    }

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.cloak = 0;
    });

    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);

    return {
      lines: [{ text: formatMessage(MessageId.CLOAK_DISENGAGED), category: 'success' }],
      broadcasts: [
        {
          room: `sector:${sectorX}:${sectorY}`,
          event: 'event.log',
          payload: {
            category: 'info',
            text: formatMessage(MessageId.CLOAK_SECTOR_DECLOAKED, ship.shipname),
          },
        },
      ],
    };
  }
}
