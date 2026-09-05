import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { parseRotation, resultingHeading } from './helpers/rotation';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles the `rotate` / `rot` command — sets the ship's pending rotation delta.
 * Energy cost, speed gate, and helm gate are deferred to feature 006.
 *
 * @see GECMDS.C:643 cmd_rotate
 */
export const rotateCommand: Command = {
  keyword: 'rotate',
  aliases: ['rot'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.ROTFMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    // C takes `rot @<deg>` as an ABSOLUTE compass heading and a bare `rot <deg>`
    // as a relative turn, quoting a different range for each on failure.
    // @see GECMDS.C:643, helpers/rotation.ts
    const result = parseRotation(args[0] ?? '');

    if (!result.ok) {
      return {
        lines: [
          {
            text: formatMessage(MessageId.NUMOOR, result.lo, result.hi),
            category: 'system',
          },
        ],
      };
    }

    // @see GECMDS.C:723 — helm gate (HLBROKE, normal branch)
    if (ship.helm !== 0) {
      return {
        lines: [{ text: formatMessage(MessageId.HLBROKE), category: 'system' }],
      };
    }

    // TODO(006): see GECMDS.C:685 — speed<0 gate (CANTROT, hyperspace branch)
    // TODO(006): see GECMDS.C:691 — useenergy gate (NOROTPW, hyperspace branch)
    // TODO(006): see GECMDS.C:717 — speed<0 gate (CANTROT, normal branch)
    // TODO(006): see GECMDS.C:711 — useenergy gate (NOROTPW, normal branch)
    // TODO(006): see GECMDS.C:679 — useenergy gate (NOROTPW, hyperspace branch)

    // C reports the heading you END UP on, not the delta you asked for:
    // `deg = normal(heading + degrees); prfmsg(NOWTURN, deg)`. Printing the
    // delta told a pilot turning from 101 by 90 they were "turning to 90".
    // @see GECMDS.C:668, GECMDS.C:705
    const target = resultingHeading(ship.heading, result);
    ship.head2b = target;
    ship.degrees = result.absolute ? 0 : result.deg;
    ship.dirty = true;

    return {
      lines: [
        {
          text: formatMessage(MessageId.NOWTURN, target),
          category: 'success',
        },
      ],
    };
  },
};
