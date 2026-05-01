import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { valdegree } from '../validators';
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
    const arg = args[0] ?? '';
    const result = valdegree(arg);

    if (!result.ok) {
      return {
        lines: [
          {
            text: formatMessage(MessageId.NUMOOR, -180, 180),
            category: 'system',
          },
        ],
      };
    }

    const value = result.value;

    // TODO(006): see GECMDS.C:685 — speed<0 gate (CANTROT, hyperspace branch)
    // TODO(006): see GECMDS.C:691 — useenergy gate (NOROTPW, hyperspace branch)
    // TODO(006): see GECMDS.C:723 — helm gate (HLBROKE, normal branch)
    // TODO(006): see GECMDS.C:717 — speed<0 gate (CANTROT, normal branch)
    // TODO(006): see GECMDS.C:711 — useenergy gate (NOROTPW, normal branch)
    // TODO(006): see GECMDS.C:679 — useenergy gate (NOROTPW, hyperspace branch)

    ship.degrees = value;
    ship.dirty = true;

    return {
      lines: [
        {
          text: formatMessage(MessageId.NOWTURN, value),
          category: 'success',
        },
      ],
    };
  },
};
