import { valdegree } from '../validators';
import { Injectable } from '@nestjs/common';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { resolveEngineCourse } from './helpers/engine-course';

/**
 * Handles `warp` / `war` — sets the ship's warp speed target with the full
 * five-gate sequence from the original C source. `ShipClass.maxWarp` is read
 * via `ShipClassCacheService` so the WARP01 (no warp drive on this class) and
 * WARPSPD2 (engines blown) refusals are correctly distinguished.
 *
 * Order of gates (mirrors `GECMDS.C:561-650 cmd_warp`):
 *   1. Class has no warp drive (maxWarp === 0) → WARP01
 *   2. Engines blown (maxWarp > 0 AND topspeed === 0) → WARPSPD2
 *   3. Negative argument → WARP02
 *   4. Hard cap (arg > topspeed + floor(topspeed/2)) → WARP03
 *   5. Overspeed warning (arg > topspeed) → WARP04 + apply
 *   6. Normal (arg ≤ topspeed) → apply
 *
 * @see GECMDS.C:561 cmd_warp
 */
@Injectable()
export class WarpHandlerService {
  constructor(private readonly shipClassCache: ShipClassCacheService) {}

  readonly command: Command = {
    keyword: 'warp',
    aliases: ['war'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.WARPFMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      // Deliberately does NOT cancel the autopilot: `war` cannot change course,
      // and `nav` sets no speed of its own, so cancelling here made the two
      // mutually exclusive — the autopilot could never fly anyone anywhere.
      // Only an explicit steering order (`imp <pct> <course>`, `rot`) or arrival
      // takes the helm back.

      const arg = args[0] ?? '';

      if (!/^-?\d+$/.test(arg.trim())) {
        return {
          lines: [{ text: formatMessage(MessageId.WARPFMT), category: 'system' }],
        };
      }

      const speed = parseInt(arg, 10);

      // `war <speed> [degrees]` — C reads a second argument through
      // `valdegree`, defaulting to "0", and turns to
      // `normal(heading + degrees)`. The port read only the speed and hard-set
      // `head2b = heading`, so firing engines always meant "straight ahead"
      // and `war 6 45` silently flew the old course. @see GECMDS.C:cmd_warp
      const courseGiven = args.length > 1;
      const courseResult = valdegree(args[1] ?? '0');
      if (!courseResult.ok) {
        return {
          lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }],
        };
      }
      const maxWarp = this.shipClassCache.getMaxWarp(ship.shpclass);
      const topspeed = ship.topspeed;

      // 1. Class has no warp drive — refuse.
      if (maxWarp === 0) {
        return { lines: [{ text: formatMessage(MessageId.WARP01), category: 'system' }] };
      }

      // 2. Engines blown (warp-capable class but topspeed has been ratcheted to 0).
      if (topspeed === 0) {
        return { lines: [{ text: formatMessage(MessageId.WARPSPD2), category: 'system' }] };
      }

      // 3. Negative argument.
      if (speed < 0) {
        return { lines: [{ text: formatMessage(MessageId.WARP02), category: 'system' }] };
      }

      // 4. Hard cap — strictly greater than topspeed + floor(topspeed/2).
      if (speed > topspeed + Math.floor(topspeed / 2)) {
        return { lines: [{ text: formatMessage(MessageId.WARP03), category: 'system' }] };
      }

      const lines: CommandResult['lines'] = [];

      // 5. Overspeed warning — proceeds and sets speed2b.
      if (speed > topspeed) {
        lines.push({
          text: formatMessage(MessageId.WARP04, topspeed),
          category: 'system',
        });
      }

      // Leave orbit on engine fire — GECMDS.C:617 LEAVEORB
      if (ship.where >= 10) ship.where = 0;

      const currentWarp = Math.round(ship.speed / 1000);

      // `deg = normal(heading + degrees)` — a RELATIVE turn, as impulse does,
      // except while `nav`'s autopilot has the helm. @see helpers/engine-course
      const course = resolveEngineCourse(ship, courseGiven, courseResult.value);
      const deg = course.deg;

      if (course.releaseAutopilot && ship.holdcourse > 0) {
        ship.holdcourse = 0;
        ship.navTargetX = null;
        ship.navTargetY = null;
      }

      ship.speed2b = 1000.0 * speed;
      if (course.setHeading) ship.head2b = deg;
      ship.dirty = true;

      let engMsg: string;
      if (speed === 0) {
        engMsg = formatMessage(MessageId.ENGSTOP);
      } else if (speed > currentWarp) {
        engMsg = `Engines fired, new course ${deg}. Accelerating to warp ${speed}.`;
      } else if (speed < currentWarp) {
        engMsg = `Engines fired, new course ${deg}. Decelerating to warp ${speed}.`;
      } else {
        engMsg = `Engines fired, new course ${deg}. Maintaining warp ${speed}.`;
      }
      lines.push({ text: engMsg, category: 'success' });

      return { lines };
    },
  };
}
