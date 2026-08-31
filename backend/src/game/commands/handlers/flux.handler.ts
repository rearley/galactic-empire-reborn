import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ENGYMAX } from '../../constants';
import { I_FLUX } from '../../constants/items';

/**
 * Handles `flux` — consumes one flux pod from cargo and restores energy
 * to ENGYMAX. Always consumes the pod, even if energy is already at max
 * (matches original game's no-short-circuit behaviour), and warns when the pod
 * spent was the last one (LASTFLUX).
 *
 * Pure command (no DI required) — operates on `ship.items` and `ship.energy`
 * directly, in-place.
 *
 * @see GECMDS.C:735-752 cmd_flux
 */
export const fluxCommand: Command = {
  keyword: 'flux',
  aliases: [],
  minArgs: 0,
  argMissingMessage: formatMessage(MessageId.FLUX_FMT),
  handler(ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult {
    const pods = ship.items[I_FLUX] ?? 0n;
    if (pods <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.FLUX_NOPODS), category: 'system' }] };
    }
    const remaining = pods - 1n;
    ship.items[I_FLUX] = remaining;
    ship.energy = ENGYMAX;
    ship.dirty = true;
    const lines: CommandResult['lines'] = [
      { text: formatMessage(MessageId.FLUX_USED), category: 'success' },
    ];
    // GECMDS.C:748 LASTFLUX — say so while the pilot can still do something
    // about it, rather than letting them find out when the tank is empty.
    if (remaining === 0n) {
      lines.push({ text: formatMessage(MessageId.FLUX_LAST), category: 'system' });
    }
    return { lines };
  },
};
