import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { cdistance } from '../../combat/combat-math';
import { UNIVMAX } from '../../constants';
import { cbearing } from '../../physics/physics-math';

/**
 * Calculates bearing from (fromX, fromY) to (toX, toY).
 * North = 0, East = 90, increasing clockwise.
 * @see scantab.ts calcBearing pattern
 */
/**
 * Absolute bearing to a point, in whole degrees, heading 0 = north.
 *
 * `-dy` matters: heading 0 is y-DECREASING, which is the convention the physics
 * tick steers by. Without the negation this returned the mirror image about the
 * east-west axis — a target due north was reported as bearing 180 — and the
 * printed course disagreed with the one the autopilot actually flew. It stayed
 * hidden while every ship spawned facing 0, because the two formulas happen to
 * agree for due-east targets.
 */
function calcBearing(
  ship: { xcoord: number; ycoord: number; heading: number },
  toX: number,
  toY: number,
): number {
  // C prints cbearing(from, to, warsptr->heading) -- a SIGNED, HEADING-RELATIVE
  // bearing (GECMDS.C:5142-5155). This function used to omit the heading term
  // entirely and return an absolute compass bearing, so `nav` told the pilot to
  // steer to a number that only coincided with the right answer while the ship
  // happened to be facing 0.
  //
  // Display only. The autopilot steers on an absolute heading computed in
  // engine-course.ts, which is our own addition -- `nav` in the original is a
  // report, not an autopilot.
  return Math.round(cbearing(ship, { xcoord: toX, ycoord: toY }, ship.heading));
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
        const bearing = calcBearing(ship, tx, ty);
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

      // Auto-break orbit into normal flight. `where === 1` is the AT-WARP
      // state — parking a stopped ship there reported "In hyperspace" and left
      // it flagged as warping for the gates that care (the hyper-phaser only
      // reaches victims at `where === 1`, GECMDS.C:1045). `imp` uses 0 for the
      // same transition (GECMDS.C:512 LEAVEORB).
      if (ship.where >= 10) {
        ship.where = 0;
      }

      // Engage autopilot
      ship.navTargetX = xParsed;
      ship.navTargetY = yParsed;
      ship.holdcourse = 1;
      ship.dirty = true;

      const tx = xParsed + 0.5;
      const ty = yParsed + 0.5;
      const bearing = calcBearing(ship, tx, ty);
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
