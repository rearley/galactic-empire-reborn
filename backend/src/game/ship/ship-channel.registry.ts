import { Injectable } from '@nestjs/common';
import { shipKey } from './ship-state.types';

/**
 * Sentinel for "no channel" / "nobody has fired on me".
 *
 * C seeds a fresh hull with `tmpshp.lastfired = -1` (GEFUNCS.C:226) and resets
 * to -1 whenever the recorded firer leaves (GEFUNCS.C:1224-1225, 1746, 1797).
 */
export const NO_CHANNEL = -1;

/**
 * Reserved: C keeps `cybmine` in a byte and uses 255 to mean "this Cybertron has
 * claimed nobody" (GECYBS.C:133, 471, 709). A real ship holding channel 255
 * would read as unclaimed, so the registry skips it.
 */
export const CYBMINE_NONE = 255;

/**
 * Assigns each in-game ship a unique small integer — this port's equivalent of
 * C's `usrnum`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Channels identify "who did that to me": `lastfired` is documented in
 * GEMAIN.H:340 as the *usernumber* of the last user to fire on you, and torpedo,
 * missile and mine records all carry the firer's channel so a kill can be
 * credited back. C resolves them by indexing the terminal table
 * (`warshpoff(ptr->lastfired)`), so a channel names exactly one ship.
 *
 * This port originally stored `shipno` in those fields. `shipno` is a PER-USER
 * index, so it is 1 for every player's first ship and for every droid — the
 * reverse lookup then matched whichever ship happened to sit first in the state
 * map. In practice that meant kill credit, loot, score and droid retaliation
 * could all land on a bystander: a pilot two sectors away, who had never fired,
 * was named as the killer of a ship they never saw.
 *
 * Channels are session-scoped and recycled, exactly as C's terminal slots are.
 * That is why `release` scrubs the channel from every ship that still refers to
 * it — without it a recycled number would silently re-point old grudges at the
 * new occupant. C does the same thing on the way out (GEFUNCS.C:1224).
 */
@Injectable()
export class ShipChannelRegistry {
  private readonly byKey = new Map<string, number>();
  private readonly byChannel = new Map<number, string>();

  /**
   * Channel for a ship, allocating one if it has none. Idempotent — a ship that
   * is already in the game keeps the channel it was given.
   *
   * Numbering starts at 1, not 0: `lastfired` defaults to 0 on stored hulls, and
   * the Vakory droid's fight-back branch tests `lastfired > 0` strictly
   * (GEDROIDS.C:447), so 0 has to keep meaning "nobody".
   */
  acquire(userid: string, shipno: number): number {
    const key = shipKey(userid, shipno);
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;

    let channel = 1;
    while (this.byChannel.has(channel) || channel === CYBMINE_NONE) channel++;
    this.byKey.set(key, channel);
    this.byChannel.set(channel, key);
    return channel;
  }

  /** Channel currently held by a ship, or NO_CHANNEL if it is not in the game. */
  channelOf(userid: string, shipno: number): number {
    return this.byKey.get(shipKey(userid, shipno)) ?? NO_CHANNEL;
  }

  /** The ship holding a channel, or undefined if the channel is free. */
  resolve(channel: number): { userid: string; shipno: number } | undefined {
    if (channel < 0) return undefined;
    const key = this.byChannel.get(channel);
    if (key === undefined) return undefined;
    const sep = key.lastIndexOf(':');
    return { userid: key.slice(0, sep), shipno: Number(key.slice(sep + 1)) };
  }

  /**
   * Release a ship's channel so it can be reused.
   *
   * Returns the freed channel (or NO_CHANNEL if the ship held none) so the
   * caller can scrub stale references — see ShipStateService, which clears
   * `lastfired` on any ship still pointing at it, mirroring GEFUNCS.C:1224.
   */
  release(userid: string, shipno: number): number {
    const key = shipKey(userid, shipno);
    const channel = this.byKey.get(key);
    if (channel === undefined) return NO_CHANNEL;
    this.byKey.delete(key);
    this.byChannel.delete(channel);
    return channel;
  }

  /** Number of channels currently held — test/diagnostic use. */
  size(): number {
    return this.byKey.size;
  }
}
