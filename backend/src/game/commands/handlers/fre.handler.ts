import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { FREQ_HAIL, FREQ_SECTOR_MAX, FREQ_GALAXY_MIN } from './_freq-thresholds';

const CHANNEL_MAP: Record<string, number> = { a: 0, b: 1, c: 2 };

const USAGE_LINE = { text: 'Usage: fre <A|B|C> <number|hail>', category: 'system' } as const;

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
      argMissingMessage: 'Usage: fre <A|B|C> <number|hail>',
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
      return { lines: [{ text: `Channel ${channelLabel} set to hail.`, category: 'success' }] };
    }

    // Reject non-integer
    if (!/^\d+$/.test(freqStr)) return { lines: [USAGE_LINE] };

    const freq = parseInt(freqStr, 10);

    // Reject explicit 0 and negatives (already rejected by regex, but 0 passes it)
    if (freq <= 0) return { lines: [USAGE_LINE] };

    ship.freq[channelIdx] = freq;
    ship.dirty = true;

    if (freq <= FREQ_SECTOR_MAX) {
      return { lines: [{ text: `Channel ${channelLabel} set to ${freq} (sector-scoped).`, category: 'success' }] };
    }

    // freq >= FREQ_GALAXY_MIN
    return { lines: [{ text: `Channel ${channelLabel} set to ${freq} (galaxy-wide).`, category: 'success' }] };
  }
}

void FREQ_GALAXY_MIN; // ensure import is used for tree-shaking
