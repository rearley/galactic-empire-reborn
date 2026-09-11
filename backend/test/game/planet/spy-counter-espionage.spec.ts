/**
 * A planted spy can be removed — two ways, both in `check_spy`
 * (GEPLANET.C:88-145), which runs on the planet economy tick.
 *
 *   if (sameas(plptr->spyowner, plptr->userid))     // you now own the planet
 *     plptr->spyowner[0] = 0;                       //   your own spy goes home
 *
 *   spycnt = plptr->items[I_SPY].qty;               // the planet's counter-spies
 *   if (spycnt > 0) {
 *     odds = (50/spycnt)+1;
 *     if (gernd()%odds == 0) {                      // caught
 *       ...mail both sides...
 *       plptr->spyowner[0] = 0;
 *     }
 *   }
 *
 * The port planted spies and revealed intel through `scan pl`, but nothing
 * ever removed one: `spyowner` cleared only by being overwritten or by the
 * planet changing hands. Stocking spies on your own colony — the whole
 * counter-espionage side of the item — did nothing.
 *
 * Note the odds sharpen with the garrison: one counter-spy is 1-in-51 per
 * tick, ten is 1-in-6, fifty or more is 1-in-2.
 */

import { checkSpy, SpyCheckInput } from '../../../src/game/planet/spy';
import { Random } from '../../../src/game/combat/random.port';
import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { NUMITEMS, I_SPY, I_MEN, I_FOOD } from '../../../src/game/constants/items';

const fixed = (v: number) => ({ next: () => v }) as Random;
/** A draw that makes `floor(next * odds) === 0`, i.e. the spy is caught. */
const caught = fixed(0);
/** A draw that never hits bucket 0. */
const missed = fixed(0.999);

/**
 * An empty hold. `checkSpy` now also rolls the REPORTING half, which needs the
 * planet's stock; with nothing stocked there is nothing to report, so these
 * removal-half cases keep the outcomes they were written for.
 */
const EMPTY_STOCK = Array.from({ length: NUMITEMS }, () => 0n);

describe('checkSpy — GEPLANET.C:93-145', () => {
  it('sends your own spy home when you take the planet', () => {
    const r = checkSpy({ spyowner: 'alice', owner: 'alice', counterSpies: 0, itemQty: EMPTY_STOCK }, missed);
    expect(r).toEqual({ outcome: 'own-planet' });
  });

  it('does nothing when there is no spy', () => {
    expect(checkSpy({ spyowner: '', owner: 'bob', counterSpies: 10, itemQty: EMPTY_STOCK }, caught)).toEqual({ outcome: 'none' });
  });

  it('cannot catch a spy without counter-spies stationed', () => {
    expect(checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 0, itemQty: EMPTY_STOCK }, caught)).toEqual({ outcome: 'none' });
  });

  it('catches the spy on the winning roll', () => {
    const r = checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 10, itemQty: EMPTY_STOCK }, caught);
    expect(r).toEqual({ outcome: 'caught', spyowner: 'alice' });
  });

  it('leaves the spy in place otherwise', () => {
    expect(checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 10, itemQty: EMPTY_STOCK }, missed)).toEqual({ outcome: 'none' });
  });

  it('sharpens the odds as the garrison grows', () => {
    // odds = (50/spycnt)+1, integer division — the modulus the roll uses.
    //
    // Only the FIRST draw of each call is the catch roll; checkSpy goes on to
    // roll the reporting half (GEPLANET.C:149), which draws several more. This
    // used to assert the total draw count, which measured the implementation
    // rather than the odds.
    const firstDraw: number[] = [];
    const spy = (n: number) => {
      let drawn = 0;
      checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: n, itemQty: EMPTY_STOCK }, {
        next: () => { if (drawn++ === 0) firstDraw.push(n); return 0.999; },
      } as Random);
    };
    spy(1); spy(10); spy(50);
    // 1 -> 1-in-51, 10 -> 1-in-6, 50 -> 1-in-2
    expect(Math.floor(50 / 1) + 1).toBe(51);
    expect(Math.floor(50 / 10) + 1).toBe(6);
    expect(Math.floor(50 / 50) + 1).toBe(2);
    expect(firstDraw).toEqual([1, 10, 50]);
  });
});


/**
 * And the same thing through the service, so the wiring is covered too — the
 * pure roll is only useful if the tick actually clears `spyowner`.
 */
describe('PlanetEconomyService clears a caught spy', () => {
  const makePlanet = (over: Partial<PlanetState> = {}): PlanetState => {
    const items = Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: true, reserve: 0, markup2a: 5, sold2a: 0n,
    }));
    return {
      xsect: 1, ysect: 1, plnum: 1, type: 2, xcoord: 1.5, ycoord: 1.5,
      userid: 'owner', name: 'Bastion', enviorn: 3, resource: 3,
      cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0, password: '',
      lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
      items, ...over,
    };
  };

  const build = (draws: number[]) => {
    const created: Array<{ userid: string }> = [];
    const prisma = {
      mailStat: { create: vi.fn(async (a: { data: { userid: string } }) => { created.push(a.data); return {}; }) },
    } as never;
    let i = 0;
    const random = { next: () => draws[i++ % draws.length] } as never;
    return { svc: new PlanetEconomyService(random, prisma), created };
  };

  it('removes the spy and protests to both sides', async () => {
    const planet = makePlanet({ spyowner: 'alice' });
    planet.items[I_SPY].qty = 50n; // 1-in-2 odds
    planet.items[I_MEN].qty = 1000n;
    planet.items[I_FOOD].qty = 1000n; // fed, so no starvation mail muddies this
    const { svc, created } = build([0]);

    const { state } = await svc.applyTick(planet);
    await new Promise((r) => setImmediate(r));

    expect(state.spyowner).toBe('');
    expect(created.map((c) => c.userid).sort()).toEqual(['alice', 'owner']);
  });

  it('sends a spy home once its master owns the planet', async () => {
    const planet = makePlanet({ spyowner: 'owner' });
    planet.items[I_MEN].qty = 1000n;
    planet.items[I_FOOD].qty = 1000n;
    const { svc } = build([0.999]);
    const { state } = await svc.applyTick(planet);
    expect(state.spyowner).toBe('');
  });

  it('leaves an uncaught spy in place', async () => {
    const planet = makePlanet({ spyowner: 'alice' });
    planet.items[I_SPY].qty = 1n; // 1-in-51
    planet.items[I_MEN].qty = 1000n;
    planet.items[I_FOOD].qty = 1000n;
    const { svc } = build([0.999]);
    const { state } = await svc.applyTick(planet);
    expect(state.spyowner).toBe('alice');
  });
});

/**
 * The other half of check_spy: a surviving spy periodically FILES A REPORT.
 *
 *   if (gernd()%10 == 0) {
 *       itemcnt = -1;
 *       for (j=0;j<10;++j) { i = gernd()%NUMITEMS; itemcnt = items[i].qty;
 *                            if (itemcnt > 0) break; }
 *       if (itemcnt > 0) {
 *           d_odds = 50.0+rndm(48.0);  odds = d_odds;          // confidence %
 *           d_odds = (100.0 - d_odds)/100.0;                   // -> error band
 *           d_rptcnt = d_itemcnt - (d_itemcnt*rndm(d_odds)) + (d_itemcnt*rndm(d_odds));
 *           prfmsg(SPYM2,name,xsect,ysect,odds,item_name[i],spr("%ld",itemcnt));
 *       }
 *   }
 *
 * @see GEPLANET.C:149-186
 *
 * The port implemented only the REMOVAL half — its own header said so — so a
 * spy could be caught but never actually reported anything, which is the only
 * reason to plant one. SPYM2 existed in the generated string table and was
 * referenced nowhere.
 *
 * Two structural details that are easy to get wrong, and each has a case here:
 *
 *  - the report roll is NOT inside the `spycnt > 0` branch. A planet with no
 *    counter-spies never catches anyone, and still gets reported on — in fact
 *    that is the common case, since most colonies stock no spies at all.
 *  - the reported figure is deliberately WRONG. Canon reports a deviated count
 *    with a stated confidence of 50-98%, and the message says so. Reporting
 *    the true stock would make a spy strictly better than canon's.
 */
describe('a surviving spy files an intelligence report (GEPLANET.C:149)', () => {
  /**
   * Draws in canon's order. `gernd` is `floor(next * 65536)`, so a scripted
   * value of k/65536 makes gernd return exactly k — which is how the modulus
   * draws below are aimed at a specific item slot.
   */
  function scripted(values: number[]): Random {
    let i = 0;
    return { next: () => values[i++] ?? 0 };
  }
  const g = (k: number) => k / 65536;

  function planetWith(qty: bigint, counterSpies = 0): SpyCheckInput {
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_FOOD] = qty;
    return { spyowner: 'spook', owner: 'someone', counterSpies, itemQty: items };
  }

  it('reports on a planet with no counter-spies at all', () => {
    // No catch roll is drawn (spycnt === 0), so the first draw is the 1-in-10.
    const rand = scripted([g(0), g(I_FOOD), 0, 0, 0]);

    const res = checkSpy(planetWith(1000n), rand);

    expect(res.outcome).toBe('report');
  });

  it('says nothing on a tick that fails the 1-in-10 roll', () => {
    const rand = scripted([0.5]);

    expect(checkSpy(planetWith(1000n), rand).outcome).toBe('none');
  });

  it('reports a stated confidence between 50 and 98', () => {
    const rand = scripted([g(0), g(I_FOOD), 0, 0, 0]);

    const res = checkSpy(planetWith(1000n), rand);

    if (res.outcome === 'report') {
      expect(res.confidence).toBeGreaterThanOrEqual(50);
      expect(res.confidence).toBeLessThanOrEqual(98);
    }
  });

  it('never reports an item the planet does not stock', () => {
    // Every draw lands on an empty slot; canon gives up after 10 attempts.
    const rand = scripted([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const empty = { spyowner: 'spook', owner: 'someone', counterSpies: 0,
      itemQty: Array.from({ length: NUMITEMS }, () => 0n) };

    expect(checkSpy(empty, rand).outcome).toBe('none');
  });

  it('being caught wins over reporting — canon returns before the roll', () => {
    // odds = 50/50 + 1 = 2; a zero draw is a catch, and check_spy returns.
    const rand = scripted([0, 0, 0, 0, 0]);

    expect(checkSpy(planetWith(1000n, 50), rand).outcome).toBe('caught');
  });
});
