import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { valpcnt } from '../validators';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles the `impulse` / `imp` command — sets the ship's impulse speed percentage.
 * Hyperspace gate and helm gate are deferred to feature 006.
 *
 * @see GECMDS.C:482 cmd_impulse
 */
export const impulseCommand: Command = {
  keyword: 'impulse',
  aliases: ['imp'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.IMPFMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    if (ship.holdcourse > 0) {
      ship.holdcourse = 0;
      ship.navTargetX = null;
      ship.navTargetY = null;
    }

    const arg = args[0] ?? '';
    const result = valpcnt(arg, 0, 99);

    if (!result.ok) {
      return {
        lines: [
          {
            text: formatMessage(MessageId.NUMOOR, 0, 99),
            category: 'system',
          },
        ],
      };
    }

    const value = result.value;

    // TODO(006): see GECMDS.C:497 — where==1 hyperspace gate (IMPULSE1)
    // TODO(006): see GECMDS.C:550 — helm gate (HLBROKE)

    ship.percent = value;
    ship.speed2b = 1000.0 * (value / 100.0);
    ship.dirty = true;

    return {
      lines: [
        {
          text: formatMessage(MessageId.ENGFIRE, ship.heading),
          category: 'success',
        },
      ],
    };
  },
};
