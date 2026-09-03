import { ShipState } from '../ship/ship-state.types';
import { I_TROOPS, ITEM_TONS, NUMITEMS } from '../constants/items';
import { Random } from './random.port';

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
}

/** Fallback hold size when the ship-class cache cannot answer. */
const DEFAULT_MAX_TONS = 5000;

/**
 * Credits a kill and moves what the killer can carry out of the wreck.
 *
 * This is canon's `killem` body, and canon has exactly ONE of it: `warhupa`
 * calls the same `killem()` on a mid-combat hangup (GEMAIN.C:1418) that
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
 * @see GEMAIN.C:1418 warhupa — same killem on the hangup path
 */
export function resolveKillSpoils(
  victim: Pick<ShipState, 'items'>,
  attacker: ShipState,
  deps: KillSpoilsDeps,
): LootTransfer[] {
  // ++(wuptr->kills) — GEFUNCS.C:1119.
  deps.mutate(attacker.userid, attacker.shipno, (a) => {
    a.kills += 1;
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
    }
  }
  return loot;
}
