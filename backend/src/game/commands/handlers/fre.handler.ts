import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { FREQ_HAIL, FREQ_SECTOR_MAX, FREQ_GALAXY_MIN } from './_freq-thresholds';
import { formatMessage, MessageId } from '../messages';

const CHANNEL_MAP: Record<string, number> = { a: 0, b: 1, c: 2 };

/**
 * Canon answers a missing argument AND a channel outside A-C with SETFMT —
 * "Type HELP SET for the correct usage" (GECMDS.C:1890, 1900). BADCOM, which
 * reads better and names the valid channels, belongs to `send` instead
 * (GECMDS.C:1868); the port had it here, on the wrong command.
 */
const USAGE_LINE = { text: formatMessage(MessageId.MSG_USAGE_FRE), category: 'system' } as const;

/**
 * Handles `fre <A|B|C> <number|hail>` — sets a channel frequency on the ship.
 * Mutates ShipState.freq[i] and sets the dirty flag.
 * @see GECMDS.C:1885 cmd_freq
 */
@Injectable()
export class FreHandlerService {
  get command(): Command {
    return {
      keyword: 'fre',
      aliases: ['freq'],
      minArgs: 2,
      argMissingMessage: formatMessage(MessageId.MSG_USAGE_FRE),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): CommandResult =>
        this.handle(ship, args, ctx),
    };
  }

  private handle(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    const channelStr = args[0].toLowerCase();
    const freqStr = args[1].toLowerCase();

    const channelIdx = CHANNEL_MAP[channelStr];
    if (channelIdx === undefined) return { lines: [USAGE_LINE] };

    const channelLabel = args[0].toUpperCase();

    if (freqStr === 'hail') {
      ship.freq[channelIdx] = FREQ_HAIL;
      ship.dirty = true;
      return { lines: [{ text: formatMessage(MessageId.FRE_HAIL, channelLabel), category: 'success' }] };
    }

    // Reject non-integer
    if (!/^\d+$/.test(freqStr)) return { lines: [USAGE_LINE] };

    const freq = parseInt(freqStr, 10);

    // A frequency of zero is its own answer in canon — FREQFMT, not SETFMT
    // (GECMDS.C:1917-1921).
    if (freq <= 0) {
      return { lines: [{ text: formatMessage(MessageId.FRE_BADFREQ), category: 'system' }] };
    }

    ship.freq[channelIdx] = freq;
    ship.dirty = true;

    if (freq <= FREQ_SECTOR_MAX) {
      return { lines: [{ text: formatMessage(MessageId.FRE_SECTOR, channelLabel, freq), category: 'success' }] };
    }

    // freq >= FREQ_GALAXY_MIN
    return { lines: [{ text: formatMessage(MessageId.FRE_GALAXY, channelLabel, freq), category: 'success' }] };
  }
}

void FREQ_GALAXY_MIN; // ensure import is used for tree-shaking
