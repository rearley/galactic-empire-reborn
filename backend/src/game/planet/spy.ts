import { Random, gernd, rndm } from '../combat/random.port';
import { NUMITEMS } from '../constants/items';

export interface SpyCheckInput {
  /** Current infiltrator's userid, or '' when the planet is clean. */
  spyowner: string;
  /** The planet's owner. */
  owner: string | null;
  /** The planet's own I_SPY stock — its counter-espionage garrison. */
  counterSpies: number;
  /** The planet's stock, per item slot — what the spy has to report on. */
  itemQty: ReadonlyArray<bigint>;
}

export type SpyCheckResult =
  /** The infiltrator now owns the planet; their spy goes home. */
  | { outcome: 'own-planet' }
  /** Counter-espionage caught them. Both sides get an official protest. */
  | { outcome: 'caught'; spyowner: string }
  /** The spy filed an intelligence report on one item's stock. */
  | {
      outcome: 'report';
      spyowner: string;
      itemIndex: number;
      /** The DEVIATED count canon reports — deliberately not the true stock. */
      reportedQty: bigint;
      /** Canon's stated confidence, 50-98%. */
      confidence: number;
    }
  /** Nothing happened this tick. */
  | { outcome: 'none' };

/**
 * The removal half of `check_spy`, run once per planet economy tick.
 *
 *   if (sameas(spyowner, userid)) spyowner[0] = 0;
 *   if (spyowner[0] != 0) {
 *     spycnt = items[I_SPY].qty;
 *     if (spycnt > 0) {
 *       odds = (50/spycnt)+1;
 *       if (gernd()%odds == 0) { ...mail both...; spyowner[0] = 0; return; }
 *     }
 *   }
 *
 * Nothing in the port removed a spy: `spyowner` cleared only by being
 * overwritten or by the planet changing hands, so stocking spies on your own
 * colony — the entire counter-espionage use of the item — did nothing.
 *
 * `50/spycnt` is integer division, so the odds sharpen in steps: one
 * counter-spy is 1-in-51 per tick, ten is 1-in-6, fifty or more is 1-in-2.
 *
 * @see GEPLANET.C:93-145 check_spy
 */
export function checkSpy(input: SpyCheckInput, rand: Random): SpyCheckResult {
  const { spyowner, owner, counterSpies } = input;

  if (spyowner !== '' && owner !== null && spyowner === owner) {
    return { outcome: 'own-planet' };
  }
  if (spyowner === '') return { outcome: 'none' };
  // No early return on an empty garrison: canon's `spycnt > 0` guards only the
  // CATCH roll, and the reporting half below runs either way. A planet with no
  // counter-spies is the common case and the one a spy is planted for.
  // @see GEPLANET.C:116-149

  if (counterSpies > 0) {
    const odds = Math.floor(50 / counterSpies) + 1;
    if (Math.floor(rand.next() * odds) === 0) {
      // Canon RETURNS here — a caught spy files nothing. @see GEPLANET.C:144
      return { outcome: 'caught', spyowner };
    }
  }

  return rollReport(input, rand);
}

/**
 * The reporting half of check_spy.
 *
 *   if (gernd()%10 == 0) {
 *       itemcnt = -1;
 *       for (j=0;j<10;++j) { i = gernd()%NUMITEMS; itemcnt = items[i].qty;
 *                            if (itemcnt > 0) break; }
 *       if (itemcnt > 0) {
 *           d_odds = 50.0+rndm(48.0);   odds = d_odds;
 *           d_odds = (100.0 - d_odds)/100.0;
 *           d_rptcnt = d_itemcnt - (d_itemcnt*rndm(d_odds)) + (d_itemcnt*rndm(d_odds));
 *       }
 *   }
 *
 * @see GEPLANET.C:149-186
 *
 * Note where this sits: OUTSIDE the `spycnt > 0` branch above. A planet with
 * no counter-spies never catches anyone and is still reported on — which is
 * the common case, since most colonies stock no spies at all. Putting the roll
 * inside that branch would make a spy useless against exactly the targets it
 * is meant for.
 *
 * The item is chosen by up to ten random draws, taking the first slot that
 * holds anything; ten empty draws and the spy reports nothing this tick.
 *
 * The figure is deliberately WRONG. Canon deviates the true count by a random
 * amount either side, bounded by a confidence of 50-98% that the message
 * states outright. Reporting the true stock would make this port's spy
 * strictly better than canon's.
 */
function rollReport(input: SpyCheckInput, rand: Random): SpyCheckResult {
  const { spyowner, itemQty } = input;

  if (gernd(rand) % 10 !== 0) return { outcome: 'none' };

  let itemIndex = -1;
  for (let j = 0; j < 10; j++) {
    const i = gernd(rand) % NUMITEMS;
    if ((itemQty[i] ?? 0n) > 0n) { itemIndex = i; break; }
  }
  if (itemIndex < 0) return { outcome: 'none' };

  const trueQty = Number(itemQty[itemIndex]);
  const confidence = Math.floor(50 + rndm(rand, 48));
  const band = (100 - confidence) / 100;
  const reported = trueQty - trueQty * rndm(rand, band) + trueQty * rndm(rand, band);

  return {
    outcome: 'report',
    spyowner,
    itemIndex,
    reportedQty: BigInt(Math.max(0, Math.trunc(reported))),
    confidence,
  };
}
