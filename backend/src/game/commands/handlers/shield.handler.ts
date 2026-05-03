import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles `shi up|dn` — manually raises or lowers shields.
 *
 * Pure command (no DI required). Confirms the original game's behaviour
 * that combat events can lower shields (e.g. firing torps drops them) but
 * the tick engine never auto-raises them — the player must request `shi up`.
 *
 * @see GECMDS.C cmd_shield
 */
export const shieldCommand: Command = {
  keyword: 'shi',
  aliases: ['shield'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.SHI_FMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'up') {
      ship.shieldstat = 1;
      ship.dirty = true;
      return { lines: [{ text: formatMessage(MessageId.SHI_UP), category: 'success' }] };
    }
    if (sub === 'dn' || sub === 'down') {
      ship.shieldstat = 0;
      ship.dirty = true;
      return { lines: [{ text: formatMessage(MessageId.SHI_DN), category: 'success' }] };
    }
    return { lines: [{ text: formatMessage(MessageId.SHI_FMT), category: 'system' }] };
  },
};
