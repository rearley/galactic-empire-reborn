import { Inject, Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { CLOAK_ENERGY_USE } from '../cloak.config';
import { CLOAK_RAMP_INIT } from '../_ship-management-constants';

/**
 * CLOK1, in the shipped table's own words. `MessageId.CLOAK_HYPERSPACE` carries
 * a paraphrase ("Cannot cloak while in hyperspace."), and `messages.ts` is not
 * this agent's to edit, so the canon string is declared locally — the same
 * pattern as SCANWRM in scan.handler.ts.
 *
 * @see GE/REL/MBMGEMSG.MSG:2381
 */
export const CLOK1 = 'We cannot operate the Cloaking device in hyperspace Sir!';

/**
 * CLOK01 — this hull has no cloaking device at all.
 * @see GECMDS.C:3192-3197, GE/REL/MBMGEMSG.MSG CLOK01
 */
export const CLOK01 = 'HAHA! A cloaking system on this tub? Sorry Sir!';

/**
 * Handles `cloak <on|off>` — toggles the cloaking device.
 *
 * On `cloak on`:
 *  - Rejects if already cloaked, damaged, or insufficient energy (hyperspace is
 *    gated ahead of the on/off dispatch, per GECMDS.C:3207).
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
    private readonly shipClassCache: ShipClassCacheService,
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

    // No cloaking device on this hull. This is the FIRST check in cmd_cloak —
    // `if (shipclass[warsptr->shpclass].max_cloak == 0) { prfmsg(CLOK01); return; }`
    // (GECMDS.C:3192-3197) — ahead of the hyperspace gate, and it was missing.
    // A captain in a hull with no cloak got the on/off machinery's answers
    // instead of being told the ship has no such device.
    if (!this.shipClassCache.getHasCloak(ship.shpclass)) {
      return { lines: [{ text: CLOK01, category: 'system' }] };
    }

    // Hyperspace is checked ONCE, ahead of the on/off dispatch (GECMDS.C:3207),
    // so it covers `cloak off` as well and outranks CLOKDAM/CLOKCOM/CLOKPWR.
    // The port checked it only on the `on` branch and only third, so a captain
    // in hyperspace typing `clo off` was told the device was "already down" —
    // true, but silent about the reason, which is the thing they needed.
    if (ship.where === 1) {
      return { lines: [{ text: CLOK1, category: 'system' }] };
    }

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
          // `outrange(FILTER,&warsptr->coord)` takes no exclude argument but
          // skips the acting ship GEOMETRICALLY: `ddist > 1` (GEMAIN.C
          // outrange), and a ship is distance 0 from its own coordinate.
          // Without this the pilot was told "Sensors indicate a ship
          // de-cloaking nearby Sir!" about themselves, one line after
          // "Cloaking device is now off, Sir!". @see GECMDS.C:3258
          excludeSelf: true,
          payload: {
            category: 'info',
            text: formatMessage(MessageId.CLOAK_SECTOR_DECLOAKED, ship.shipname),
          },
        },
      ],
    };
  }
}
