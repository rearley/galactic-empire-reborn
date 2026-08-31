import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { FREQ_SECTOR_MAX, FREQ_GALAXY_MIN } from './_freq-thresholds';

const CHANNEL_MAP: Record<string, number> = { a: 0, b: 1, c: 2 };
const MAX_MSG_LEN = 200;

/**
 * Handles `sen <A|B|C> <message>` — broadcasts a message per sender's frequency.
 * Hail (freq=0): all sockets, cloaked filtered by gateway.
 * Sector (1-19999): sector room.
 * Galaxy (>=20000): all sockets.
 * @see GECMDS.C:1825 cmd_send
 */
@Injectable()
export class SenHandlerService {
  get command(): Command {
    return {
      keyword: 'sen',
      aliases: [],
      minArgs: 2,
      argMissingMessage: 'Usage: sen <A|B|C> <message>',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): CommandResult =>
        this.handle(ship, args, ctx),
    };
  }

  private handle(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    const channelStr = args[0].toLowerCase();
    const channelIdx = CHANNEL_MAP[channelStr];
    if (channelIdx === undefined) {
      return { lines: [{ text: 'Usage: sen <A|B|C> <message>', category: 'system' }] };
    }

    const messageText = args.slice(1).join(' ');
    if (messageText.length > MAX_MSG_LEN) {
      return { lines: [{ text: 'Usage: sen <A|B|C> <message>', category: 'system' }] };
    }

    const channelLabel = args[0].toUpperCase();
    const freq = ship.freq[channelIdx] ?? 0;

    let room: string;
    if (freq <= 0) {
      room = 'hail';
    } else if (freq <= FREQ_SECTOR_MAX) {
      const xs = Math.floor(ship.xcoord);
      const ys = Math.floor(ship.ycoord);
      room = `sector:${xs}:${ys}`;
    } else {
      room = 'galaxy';
    }

    // C confirms back to the sender with the frequency it went out on
    // (MSGSNT4 / MSGSNT6) and excludes them from the transmission itself.
    const confirmation =
      freq > 0
        ? `Message sent on channel ${channelLabel}, frequency ${freq}.`
        : `Message sent on channel ${channelLabel} (open hail).`;

    return {
      lines: [{ text: confirmation, category: 'system' }],
      broadcasts: [
        {
          room,
          event: 'message.send',
          payload: { from: ship.shipname, channel: channelLabel, text: messageText },
          // A tuned channel reaches only ships carrying the same frequency;
          // an open hail (freq 0) carries none and reaches everyone in range.
          ...(freq > 0 ? { freq } : {}),
          excludeSelf: true,
        },
      ],
    };
  }
}

void FREQ_GALAXY_MIN;
