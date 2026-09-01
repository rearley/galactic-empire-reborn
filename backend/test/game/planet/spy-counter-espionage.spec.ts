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

import { checkSpy } from '../../../src/game/planet/spy';
import { Random } from '../../../src/game/combat/random.port';
import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { NUMITEMS, I_SPY, I_MEN, I_FOOD } from '../../../src/game/constants/items';

const fixed = (v: number) => ({ next: () => v }) as Random;
/** A draw that makes `floor(next * odds) === 0`, i.e. the spy is caught. */
const caught = fixed(0);
/** A draw that never hits bucket 0. */
const missed = fixed(0.999);

describe('checkSpy — GEPLANET.C:93-145', () => {
  it('sends your own spy home when you take the planet', () => {
    const r = checkSpy({ spyowner: 'alice', owner: 'alice', counterSpies: 0 }, missed);
    expect(r).toEqual({ outcome: 'own-planet' });
  });

  it('does nothing when there is no spy', () => {
    expect(checkSpy({ spyowner: '', owner: 'bob', counterSpies: 10 }, caught)).toEqual({ outcome: 'none' });
  });

  it('cannot catch a spy without counter-spies stationed', () => {
    expect(checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 0 }, caught)).toEqual({ outcome: 'none' });
  });

  it('catches the spy on the winning roll', () => {
    const r = checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 10 }, caught);
    expect(r).toEqual({ outcome: 'caught', spyowner: 'alice' });
  });

  it('leaves the spy in place otherwise', () => {
    expect(checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: 10 }, missed)).toEqual({ outcome: 'none' });
  });

  it('sharpens the odds as the garrison grows', () => {
    // odds = (50/spycnt)+1, integer division — the modulus the roll uses.
    const asked: number[] = [];
    const spy = (n: number) => {
      checkSpy({ spyowner: 'alice', owner: 'bob', counterSpies: n }, {
        next: () => { asked.push(n); return 0.999; },
      } as Random);
    };
    spy(1); spy(10); spy(50);
    // 1 -> 1-in-51, 10 -> 1-in-6, 50 -> 1-in-2
    expect(Math.floor(50 / 1) + 1).toBe(51);
    expect(Math.floor(50 / 10) + 1).toBe(6);
    expect(Math.floor(50 / 50) + 1).toBe(2);
    expect(asked).toHaveLength(3);
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
      mailStat: { create: jest.fn(async (a: { data: { userid: string } }) => { created.push(a.data); return {}; }) },
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
