import { MAXTORPS } from '../constants';

/** The value C uses in `ltorps[i].channel` to mean "this tube is empty". */
export const FREE_SLOT_CHANNEL = 255;

/**
 * Find the lowest free incoming-torpedo slot on a target, or -1 if all
 * `MAXTORPS` tubes are already tracking.
 *
 *   for (i=0;i<MAXTORPS;++i)
 *       if (wptr->ltorps[i].channel == 255) break;
 *   if (i == MAXTORPS) { prfmsg(TORFULL); return; }
 *   -- GECMDS.C:1178-1184
 *
 * Canon iterates a FIXED-SIZE struct array, so a ship nothing is chasing has
 * three free slots by construction. We store the same data as a Postgres
 * `Int[]`, which defaults to `[]` and is grown lazily by whoever fires first
 * — so the array's LENGTH carries no information and must never be used as
 * the bound. Two AI launch paths searched it with
 * `ltorpsChannel.findIndex(...)`, whose -1 on an empty array is
 * indistinguishable from "full": every AI torpedo aimed at a ship no human
 * had ever torpedoed was discarded at the tube.
 *
 * @see GECMDS.C:1178-1184 torp
 */
export function findFreeTorpSlot(channels: readonly number[]): number {
  for (let i = 0; i < MAXTORPS; i++) {
    const ch = channels[i];
    if (ch === undefined || ch === FREE_SLOT_CHANNEL) return i;
  }
  return -1;
}
