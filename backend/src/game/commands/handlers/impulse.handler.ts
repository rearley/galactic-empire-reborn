import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { valpcnt, valdegree } from '../validators';
import { ShipState } from '../../ship/ship-state.types';
import { resolveEngineCourse } from './helpers/engine-course';

/**
 * Handles the `impulse` / `imp` command — sets the ship's impulse speed percentage
 * and optionally a relative course change.
 *
 * Usage: imp <0-99> [degrees]
 * - degrees is RELATIVE to current heading (added to heading, not absolute).
 *   `imp 50` → maintain current heading at 50% impulse.
 *   `imp 50 90` → turn 90° from current heading at 50% impulse.
 *
 * @see GECMDS.C:482 cmd_impulse
 * @see GECMDS.C:519 deg = normal(heading + degrees) — relative rotation
 */
export const impulseCommand: Command = {
  keyword: 'impulse',
  aliases: ['imp'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.IMPFMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    // A speed order alone is not a steering order: `nav` sets no speed, so
    // cancelling the autopilot here made the two mutually exclusive. Supplying a
    // COURSE is an explicit steering order and does take the helm back.
    const courseGiven = args.length > 1;

    const speedArg = args[0] ?? '';
    const speedResult = valpcnt(speedArg, 0, 99);

    if (!speedResult.ok) {
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, 0, 99), category: 'system' }],
      };
    }

    // Optional course arg — relative degrees added to current heading (@see GECMDS.C:502-505)
    const courseArg = args[1] ?? '0';
    const courseResult = valdegree(courseArg);
    if (!courseResult.ok) {
      // valdegree's own range, which is what C prints on this failure
      // (GEFUNCS.C:1933). Quoting 0-359 here rejected a course of 208 — a
      // number inside the range the message named — with no hint why.
      // C's 0-359 belongs to `rot @`, a different form. @see GECMDS.C:672
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }],
      };
    }

    // TODO(006): see GECMDS.C:497 — where==1 hyperspace gate (IMPULSE1)
    // TODO(006): see GECMDS.C:550 — helm gate (HLBROKE)

    const value = speedResult.value;
    const course = resolveEngineCourse(ship, courseGiven, courseResult.value);
    const deg = course.deg;

    if (course.releaseAutopilot && ship.holdcourse > 0) {
      ship.holdcourse = 0;
      ship.navTargetX = null;
      ship.navTargetY = null;
    }

    // Leave orbit on engine fire — GECMDS.C:512 LEAVEORB
    if (ship.where >= 10) ship.where = 0;

    ship.percent = value;
    ship.speed2b = 1000.0 * (value / 100.0);
    if (course.setHeading) ship.head2b = deg;
    ship.dirty = true;

    return {
      lines: [
        value === 0
          ? { text: formatMessage(MessageId.ENGSTOP), category: 'success' }
          : { text: formatMessage(MessageId.ENGFIRE, deg), category: 'success' },
      ],
    };
  },
};
