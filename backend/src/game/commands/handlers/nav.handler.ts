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

      // NO "already at target" refusal. cmd_navigate (GECMDS.C:5109-5157)
      // validates only the argument count and the univmax bounds, then returns
      // a bearing — including to a point inside the sector you are already in.
      //
      // The invented refusal was the worst onboarding cliff in the game: every
      // new player spawns in sector (0,0) and must reach Zygor-3 at its centre
      // to buy anything, and `nav 0 0` was the natural way to ask which way it
      // lies. The port answered "Already at target sector." and left them with
      // no way to find the one planet the whole opening depends on.

      // NO ORBIT BREAK. C's cmd_navigate (GECMDS.C:5109-5155) is argument
      // validation, cdistance, cbearing and prfmsg(NAV01) and nothing else — it
      // never writes warsptr->where and never resets repair. Breaking orbit is
      // what the ENGINE commands do (GECMDS.C:511-516 imp, :617-622 war), and
      // warp/impulse in this port already do it.
      //
      // This handler used to undock as a side effect, so a pilot parked at the
      // Zygor-3 shop who merely asked which way (0,0) lay was thrown out of
      // orbit by a QUERY and had to fly a 439-unit round trip on impulse to get
      // back and finish trading. The autopilot course is a documented deviation
      // (docs/DECISIONS.md, feature 016 D1) and stays; the undocking does not.

      // Was this exact target already engaged? Read it BEFORE overwriting.
      const alreadyEngaged =
        ship.holdcourse === 1 &&
        ship.navTargetX === xParsed &&
        ship.navTargetY === yParsed;

      // Engage autopilot
      ship.navTargetX = xParsed;
      ship.navTargetY = yParsed;
      ship.holdcourse = 1;
      ship.dirty = true;

      const tx = xParsed + 0.5;
      const ty = yParsed + 0.5;
      const bearing = calcBearing(ship, tx, ty);
      const dist = Math.floor(cdistance(ship, { xcoord: tx, ycoord: ty }) * 10000);

      // NAV01's bearing is RELATIVE to the hull's present heading
      // (GECMDS.C:5142-5155 passes warsptr->heading to cbearing). Our physics
      // tick steers head2b onto the autopilot course every tick, so an
      // identical `nav 0 0` seconds later prints a smaller number — bearing 131
      // and then bearing 0, with no rotate issued in between. The arithmetic
      // was right both times; nothing said why, and it landed on a new pilot's
      // very first navigation attempt.
      const helm =
        bearing === 0
          ? alreadyEngaged
            ? 'Helm reports we are already on course, Sir!'
            : 'Helm reports we are on course, Sir!'
          : 'Bearing is relative to our present heading, Sir — the helm is ' +
            'swinging onto course, so a repeat nav will read a smaller bearing ' +
            'until it reads 0.';

      return {
        lines: [
          {
            text: formatMessage(MessageId.NAV01, xParsed, yParsed, bearing, dist),
            category: 'success',
          },
          { text: helm, category: 'system' },
        ],
      };
    },
  };
}
