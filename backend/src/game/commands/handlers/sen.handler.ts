import { Injectable, Optional } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { FREQ_SECTOR_MAX, FREQ_GALAXY_MIN } from './_freq-thresholds';
import { formatMessage, MessageId } from '../messages';
import { shipKey } from '../../ship/ship-state.types';
import { allowChat } from './helpers/chat-throttle';
import { expandTargetToken } from './helpers/target-token';
import { ShipStateService } from '../../ship/ship-state.service';

const CHANNEL_MAP: Record<string, number> = { a: 0, b: 1, c: 2 };
/**
 * PORT-ORIGINAL. Canon has no cap of its own — `cmd_send` rebuilds the line with
 * `rstrin()` and sends it whole, so the MajorBBS input buffer was the only limit.
 * @see docs/DECISIONS.md 2026-09-19 — `sen` message cap
 */
const MAX_MSG_LEN = 500;

/**
 * Handles `sen <A|B|C> <message>` — broadcasts a message per sender's frequency.
 * Hail (freq=0): all sockets, cloaked filtered by gateway.
 * Sector (1-19999): sector room.
 * Galaxy (>=20000): all sockets.
 * @see GECMDS.C:1825 cmd_send
 */
@Injectable()
export class SenHandlerService {
  /**
   * Send timestamps per ship, inside the throttle window only — `allowChat`
   * returns the pruned list, so this cannot grow with time. Keyed by ship, so
   * one pilot shouting never silences another. In-memory and process-local,
   * consistent with the no-Redis rule: a restart forgives everyone, which for a
   * chat limit is the right failure direction.
   */
  private readonly recentSends = new Map<string, number[]>();

  /**
   * Clock, so the throttle is testable without real time. `@Optional` because
   * Nest cannot resolve a bare function type — it passes undefined and the
   * default takes over, which is exactly the production behaviour.
   */
  constructor(
    @Optional() private readonly now: () => number = () => Date.now(),
    /**
     * Resolves the locked target for `%t`. `@Optional` and LAST so the many
     * hand-built test harnesses that construct this with a clock alone keep
     * working — without it `%t` simply never expands, which is the same
     * refusal a pilot with no lock gets.
     */
    @Optional() private readonly shipService?: ShipStateService,
  ) {}

  /**
   * The name of the ship this pilot has locked, or null.
   *
   * Resolved from `lockKey` rather than `lock`: `lock` holds a shipno, which is
   * per-user and therefore 1 for almost every first hull in the game, while
   * `lockKey` is the full "userid:shipno". Reading the wrong one is how an
   * earlier bug named a bystander as a killer. @see ship-channel.registry.ts
   *
   * A lock on a ship that has since left the game resolves to null, and the
   * caller refuses — a stale lock must not transmit a stale name.
   */
  private lockedTargetName(ship: ShipState): string | null {
    const key = ship.lockKey;
    if (!key || !this.shipService) return null;
    const sep = key.lastIndexOf(':');
    if (sep === -1) return null;
    const target = this.shipService.get(key.slice(0, sep), Number(key.slice(sep + 1)));
    return target?.shipname ?? null;
  }

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
    // BADCOM is `send`'s own answer for a channel outside A-C (GECMDS.C:1868).
    if (channelIdx === undefined) {
      return { lines: [{ text: formatMessage(MessageId.MSG_BADCOM), category: 'system' }] };
    }

    const typed = args.slice(1).join(' ');

    // `%t` becomes the ship you have locked. Expanded BEFORE the length check,
    // so the cap applies to what actually goes out rather than to the template
    // — a short line naming a long ship name is still a long line.
    const expansion = expandTargetToken(typed, this.lockedTargetName(ship));
    if (!expansion.ok) {
      return {
        lines: [{
          text: 'No target locked, Sir — `loc <ship>` first, then say your piece.',
          category: 'system',
        }],
      };
    }
    const messageText = expansion.text;
    if (messageText.length > MAX_MSG_LEN) {
      return { lines: [{ text: formatMessage(MessageId.MSG_TOO_LONG, messageText.length, MAX_MSG_LEN), category: 'system' }] };
    }

    // PORT-ORIGINAL rate limit. Canon throttles `send` not at all — MajorBBS
    // gave one command per user per pass, so a flood was unreachable from a
    // terminal. Over a socket `sen` makes no database call, completes instantly
    // and the per-socket command queue does not slow it, so one client could
    // fill every other player's log as fast as it could send packets.
    // @see helpers/chat-throttle.ts, docs/DECISIONS.md 2026-09-09
    const key = shipKey(ship.userid, ship.shipno);
    const gate = allowChat(this.recentSends.get(key) ?? [], this.now());
    this.recentSends.set(key, gate.history);
    if (!gate.allowed) {
      return { lines: [{ text: 'You are sending too fast — slow down, Sir.', category: 'system' }] };
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
    // Canon confirms differently for each of the three tiers: MSGSNT2 for an
    // open hail, MSGSNT4 naming the com frequency, MSGSNT6 naming the
    // hyperspace code (GECMDS.C:1834-1862). The port had one invented line for
    // all three, so the confirmation never told you which way the message had
    // actually gone out.
    const confirmation =
      freq <= 0
        ? formatMessage(MessageId.MSG_SENT)
        : freq <= FREQ_SECTOR_MAX
          ? formatMessage(MessageId.MSG_SENT_SECTOR, freq)
          : formatMessage(MessageId.MSG_SENT_HYPER, freq);

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
