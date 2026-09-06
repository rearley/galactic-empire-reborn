import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { parseRotation, resultingHeading } from './helpers/rotation';
import { ShipState } from '../../ship/ship-state.types';
import { ROTENGUSE, USEENERGY_RESERVE } from '../../constants';
import { tryEnergyDebit } from '../../physics/physics-math';

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

    // Turning costs energy, and the turn only happens if the ship can pay:
    //   if (useenergy(warsptr,usrnum,ROTENGUSE) == 1) { ...turn... }
    //   else { prfmsg(NOROTPW); }
    // @see GECMDS.C:660 (hyperspace branch), :702 (normal branch)
    //
    // useenergy keeps a 500-unit reserve on top of the cost — the original's
    // own comment is `/* fudge a bit */` — so a ship is refused while it still
    // has ROTENGUSE in the tank. @see GEFUNCS.C:1500-1515
    const debit = tryEnergyDebit(ship.energy, ROTENGUSE, USEENERGY_RESERVE);
    if (!debit.ok) {
      return {
        lines: [{ text: formatMessage(MessageId.NOROTPW), category: 'system' }],
      };
    }
    ship.energy = debit.newEnergy;

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
