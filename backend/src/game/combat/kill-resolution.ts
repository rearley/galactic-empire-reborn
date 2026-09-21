import { ShipState } from '../ship/ship-state.types';
import { I_TROOPS, ITEM_TONS, NUMITEMS } from '../constants/items';
import { Random } from './random.port';
import { NO_CHANNEL } from '../ship/ship-channel.registry';

/** One item stack that moved from the victim's hold to the killer's. */
export interface LootTransfer {
  itemIndex: number;
  amount: bigint;
}

/** The two things `killem` needs from the outside world. */
export interface KillSpoilsDeps {
  /** ShipStateService.mutate — the only sanctioned way to write ship state. */
  mutate(userid: string, shipno: number, fn: (s: ShipState) => void): void;
  /** Killer's hold capacity, by ship class. May throw when the class is uncached. */
  maxTonsFor(shpclass: number): number;
  random: Random;
  /**
   * Told about each stack `chkweight` refused. Canon discards it silently, and
   * so does the game; this exists only so the kill log can say what a full
   * hold cost. PORT-ORIGINAL @not-a-house-rule: bookkeeping, no effect on play.
   */
  onDropped?(transfer: LootTransfer): void;
}

/** Fallback hold size when the ship-class cache cannot answer. */
const DEFAULT_MAX_TONS = 5000;

/**
 * Credits a kill and moves what the killer can carry out of the wreck.
 *
 * This is canon's `killem` body, and canon has exactly ONE of it: `warhupa`
 * calls the same `killem()` on a mid-combat hangup (GEMAIN.C:1420) that
 * `checkdam` calls on a normal death, and the cargo loop is unconditional on
 * how the victim died. The port had two copies — the combat tick's, which did
 * the transfer, and the gateway's disconnect path, which hardcoded `loot: []`
 * — so rage-quitting was the one death that paid the killer nothing. Hence one
 * shared function rather than a second transcription.
 *
 * Rules preserved from GEFUNCS.C:1122-1136:
 *   • the loop starts at 1, so I_MEN (0) is never looted, and I_TROOPS is
 *     skipped explicitly — "no men or troops can be collected";
 *   • each stack is divided by `gernd()%5 + 1`, so between a fifth and all of
 *     it survives;
 *   • `chkweight` gates every stack, and a stack that will not fit is dropped
 *     entirely rather than part-loaded.
 *
 * @see GEFUNCS.C:1116-1136 killem
 * @see GEMAIN.C:1420 warhupa — same killem on the hangup path
 */
export function resolveKillSpoils(
  victim: Pick<ShipState, 'items'>,
  attacker: ShipState,
  deps: KillSpoilsDeps,
): LootTransfer[] {
  // ++(wuptr->kills) — GEFUNCS.C:1118.
  deps.mutate(attacker.userid, attacker.shipno, (a) => {
    a.kills += 1;
    // Canon has ONE counter and `chkcyb` reads it live (GECYBS.C:441, :524).
    // This port splits it into per-hull Ship.kills and cumulative User.kills,
    // and `userKills` caches the latter. Bump the cache in step with the row
    // PlayerScoreRepository increments, or the Cybertron difficulty gates only
    // move when a captain logs out and back in. Undefined means an AI killer,
    // which has no User row — leave it undefined so escalationKills falls back
    // to Ship.kills. @see ShipState.userKills
    if (a.userKills != null) a.userKills += 1;
  });

  let maxTons = DEFAULT_MAX_TONS;
  try {
    maxTons = deps.maxTonsFor(attacker.shpclass);
  } catch {
    /* class not cached — fall back to a safe capacity */
  }

  let usedTons = 0;
  for (let i = 0; i < NUMITEMS; i++) {
    usedTons += Number(attacker.items[i] ?? 0n) * ITEM_TONS[i];
  }

  const loot: LootTransfer[] = [];
  for (let i = 1; i < NUMITEMS; i++) {
    if (i === I_TROOPS) continue;
    const victimAmt = victim.items[i] ?? 0n;
    if (victimAmt <= 0n) continue;

    const divisor = BigInt(Math.floor(deps.random.next() * 5) + 1);
    const amt = victimAmt / divisor;
    if (amt <= 0n) continue;

    const neededTons = Number(amt) * ITEM_TONS[i];
    if (neededTons <= maxTons - usedTons) {
      deps.mutate(attacker.userid, attacker.shipno, (a) => {
        a.items[i] = (a.items[i] ?? 0n) + amt;
      });
      usedTons += neededTons;
      loot.push({ itemIndex: i, amount: amt });
    } else {
      deps.onDropped?.({ itemIndex: i, amount: amt });
    }
  }
  return loot;
}

/**
 * The name of whoever last landed damage on `victim`, or null if nobody can be
 * named honestly.
 *
 * `lastfired` alone is not enough. `ShipStateService.leave()` scrubs it back to
 * NO_CHANNEL whenever the channel it points at is recycled, so a killer who
 * logged off in the same tick as the kill left no trace and the ship-loss mail
 * read "an unknown assailant". `lastfiredBy` is recorded at damage time and
 * survives that scrub — but it must only be trusted while it still describes
 * `lastfired`:
 *
 *   • recorded channel === `lastfired`  — the ordinary case, attacker still in
 *     the game (or removed later this tick, which is why the name is read off
 *     the state rather than re-resolved);
 *   • `lastfired` is NO_CHANNEL and the recorded channel is no longer held by
 *     any ship — the scrub case, the one this exists for.
 *
 * Everything else names nobody, and the fallback must honour the SAME guards
 * as the live lookup it stands in for — otherwise it replaces "an unknown
 * assailant" with a specific accusation that is false, which is worse than the
 * bug it fixes:
 *
 *   • A SELF-KILL names nobody. Canon's guard is `who != usrn`, and its comment
 *     is the 12/19/91 fix "to prevent a player from being awarded points for
 *     killing himself" (GEFUNCS.C:1100-1105). `findActiveAttackerByChannel`
 *     already refuses this; without `victimChannel` here the fallback happily
 *     named the victim as their own killer.
 *   • A PLANET's ion cannons name nobody. `fireion` sets `ptr->lastfired = -1`
 *     (GEFUNCS.C:1797) while the ship that last shot you is still flying, so
 *     crediting that pilot for a colony's kill is a fresh lie. The live-channel
 *     test catches that while the shooter is in the game; the ion path also
 *     clears `lastfiredBy`, which is the only thing that catches it once the
 *     shooter has logged off too.
 *
 * @see GEFUNCS.C:1100-1105 killem — canon reads lastfired, range-checks it, and
 *      refuses the victim's own channel
 * @see GEFUNCS.C:1224-1225 — canon's only scrub, on death
 */
export function attackerNameFromLastFired(
  victim: Pick<ShipState, 'lastfired' | 'lastfiredBy'>,
  isChannelHeld: (channel: number) => boolean,
  victimChannel?: number,
): string | null {
  const recorded = victim.lastfiredBy;
  if (recorded === undefined) return null;
  // `who != usrn` — a pilot is never their own killer.
  if (victimChannel !== undefined && recorded.channel === victimChannel) return null;
  if (recorded.channel === victim.lastfired) return recorded.name;
  if (victim.lastfired === NO_CHANNEL && !isChannelHeld(recorded.channel)) return recorded.name;
  return null;
}
