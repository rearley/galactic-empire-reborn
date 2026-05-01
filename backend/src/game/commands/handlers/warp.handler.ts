import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles the `warp` / `war` command — sets the ship's warp speed.
 * Warp drive online gate (WARPSPD2) and helm gate are deferred to feature 006.
 *
 * Source note: `topspeed` is from the ship's live field, not ShipClass.
 * WARP04 is a warning-and-apply (not a rejection).
 * `speed2b = 1000.0 * speed` (warp speed, not impulse percentage).
 *
 * TODO(006): replace topspeed==0 WARP01 proxy with direct ShipClass.maxWarp lookup
 *   via PrismaService to distinguish class-level no-warp (WARP01) from offline (WARPSPD2).
 *
 * @see GECMDS.C:561 cmd_warp
 */
export const warpCommand: Command = {
  keyword: 'warp',
  aliases: ['war'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.WARPFMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    const arg = args[0] ?? '';

    // Validate: must be a non-empty integer string
    if (!/^-?\d+$/.test(arg.trim())) {
      return {
        lines: [{ text: formatMessage(MessageId.WARPFMT), category: 'system' }],
      };
    }

    const speed = parseInt(arg, 10);
    const topspeed = ship.topspeed;

    // No warp drive — topspeed 0 used as proxy for ShipClass.maxWarp == 0.
    // TODO(006): replace with direct ShipClass.maxWarp lookup via PrismaService.
    if (topspeed === 0) {
      return {
        lines: [{ text: formatMessage(MessageId.WARP01), category: 'system' }],
      };
    }

    // TODO(006): see GECMDS.C:575 — warsptr->topspeed==0 offline gate (WARPSPD2)

    if (speed < 0) {
      return {
        lines: [{ text: formatMessage(MessageId.WARP02), category: 'system' }],
      };
    }

    // Exceeds hard ceiling (> 150% of topspeed) — rejection per GECMDS.C:604
    if (speed > topspeed + Math.floor(topspeed / 2)) {
      return {
        lines: [{ text: formatMessage(MessageId.WARP03), category: 'system' }],
      };
    }

    // TODO(006): see GECMDS.C:633 — helm gate (HLBROKE)

    const lines: Array<{ text: string; category: 'system' | 'info' | 'success' | 'combat' }> = [];

    // WARP04: warning-and-apply — prints warning but still continues per GECMDS.C:614-619
    if (speed > topspeed) {
      lines.push({
        text: formatMessage(MessageId.WARP04, topspeed),
        category: 'system',
      });
    }

    ship.speed2b = 1000.0 * speed;
    ship.dirty = true;

    lines.push({
      text: formatMessage(MessageId.ENGFIRE, ship.heading),
      category: 'success',
    });

    return { lines };
  },
};
