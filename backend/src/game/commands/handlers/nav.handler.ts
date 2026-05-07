import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { cdistance } from '../../combat/combat-math';
import { UNIVMAX } from '../../constants';

/**
 * Calculates bearing from (fromX, fromY) to (toX, toY).
 * North = 0, East = 90, increasing clockwise.
 * @see scantab.ts calcBearing pattern
 */
function calcBearing(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
}

/**
 * Handles the `nav <x> <y>` command — engage autopilot to target sector.
 * With no args, shows current autopilot status.
 *
 * @see GECMDS.C:5120 cmd_navigate
 * @see specs/016-navigation-spy/contracts/nav-command.md
 */
@Injectable()
export class NavHandlerService {
  constructor(private readonly shipStateService: ShipStateService) {}

  readonly command: Command = {
    keyword: 'nav',
    aliases: [],
    minArgs: 0,
    argMissingMessage: formatMessage(MessageId.NAVFMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      // Status form — no args
      if (args.length === 0) {
        if (ship.holdcourse === 0) {
          return {
            lines: [{ text: formatMessage(MessageId.NAV_INACTIVE), category: 'system' }],
          };
        }

        // Active autopilot — show status
        const tx = (ship.navTargetX ?? 0) + 0.5;
        const ty = (ship.navTargetY ?? 0) + 0.5;
        const bearing = calcBearing(ship.xcoord, ship.ycoord, tx, ty);
        const dist = Math.floor(cdistance(ship, { xcoord: tx, ycoord: ty }) * 10000);

        return {
          lines: [
            {
              text: formatMessage(
                MessageId.NAV_STATUS,
                ship.navTargetX ?? 0,
                ship.navTargetY ?? 0,
                dist,
                bearing,
              ),
              category: 'system',
            },
          ],
        };
      }

      // Engage form — must have exactly 2 args
      if (args.length !== 2) {
        return {
          lines: [{ text: formatMessage(MessageId.NAVFMT), category: 'system' }],
        };
      }

      // Reject non-integer strings (e.g. '3.7') — parseInt('3.7') = 3, not NaN
      if (!/^-?\d+$/.test(args[0].trim()) || !/^-?\d+$/.test(args[1].trim())) {
        return {
          lines: [{ text: formatMessage(MessageId.NAVFMT), category: 'system' }],
        };
      }

      const xParsed = parseInt(args[0], 10);
      const yParsed = parseInt(args[1], 10);

      if (isNaN(xParsed) || isNaN(yParsed)) {
        return {
          lines: [{ text: formatMessage(MessageId.NAVFMT), category: 'system' }],
        };
      }

      if (Math.abs(xParsed) > UNIVMAX || Math.abs(yParsed) > UNIVMAX) {
        return {
          lines: [{ text: formatMessage(MessageId.NAVFMT), category: 'system' }],
        };
      }

      // Already at target?
      if (Math.floor(ship.xcoord) === xParsed && Math.floor(ship.ycoord) === yParsed) {
        return {
          lines: [{ text: formatMessage(MessageId.NAV_ALREADY_THERE), category: 'system' }],
        };
      }

      // Auto-break orbit
      if (ship.where >= 10) {
        ship.where = 1;
      }

      // Engage autopilot
      ship.navTargetX = xParsed;
      ship.navTargetY = yParsed;
      ship.holdcourse = 1;
      ship.dirty = true;

      const tx = xParsed + 0.5;
      const ty = yParsed + 0.5;
      const bearing = calcBearing(ship.xcoord, ship.ycoord, tx, ty);
      const dist = Math.floor(cdistance(ship, { xcoord: tx, ycoord: ty }) * 10000);

      return {
        lines: [
          {
            text: formatMessage(MessageId.NAV01, xParsed, yParsed, bearing, dist),
            category: 'success',
          },
        ],
      };
    },
  };
}
