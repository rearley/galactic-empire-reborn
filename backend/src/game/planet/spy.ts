import { Random } from '../combat/random.port';

export interface SpyCheckInput {
  /** Current infiltrator's userid, or '' when the planet is clean. */
  spyowner: string;
  /** The planet's owner. */
  owner: string | null;
  /** The planet's own I_SPY stock — its counter-espionage garrison. */
  counterSpies: number;
}

export type SpyCheckResult =
  /** The infiltrator now owns the planet; their spy goes home. */
  | { outcome: 'own-planet' }
  /** Counter-espionage caught them. Both sides get an official protest. */
  | { outcome: 'caught'; spyowner: string }
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
  if (counterSpies <= 0) return { outcome: 'none' };

  const odds = Math.floor(50 / counterSpies) + 1;
  if (Math.floor(rand.next() * odds) === 0) {
    return { outcome: 'caught', spyowner };
  }
  return { outcome: 'none' };
}
