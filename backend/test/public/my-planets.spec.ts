import { ownedPlanetsFor } from '../../src/public/my-planets';
import { MyPlanetsController } from '../../src/public/my-planets.controller';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { NUMITEMS, I_MEN, I_FOOD, I_GOLD } from '../../src/game/constants/items';

/**
 * `/public/my-planets` fills the calculator from a signed-in player's own
 * colonies. The whole risk is in WHOSE planets come back, so most of this is
 * about the filter; the rest pins that the shape is exactly the calculator's
 * input, so a picked planet and a typed one reach the tick identically.
 */
function planet(over: Partial<PlanetState> & { qty?: bigint[]; rate?: number[] }): PlanetState {
  const { qty = [], rate = [], ...rest } = over;
  return {
    xsect: 0, ysect: 0, plnum: 1, type: 1, xcoord: 0, ycoord: 0,
    userid: null, name: 'Unnamed', enviorn: 2, resource: 2,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, (_, i) => ({
      qty: qty[i] ?? 0n, rate: rate[i] ?? 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
    ...rest,
  };
}

describe('ownedPlanetsFor', () => {
  it('returns only the caller\'s planets — not a rival\'s, not unowned ones', () => {
    const list = ownedPlanetsFor('usr_me', [
      planet({ userid: 'usr_me', name: 'Mine' }),
      planet({ userid: 'usr_rival', name: 'Theirs' }),
      planet({ userid: null, name: 'Nobody' }),
    ]);
    expect(list.map((p) => p.name)).toEqual(['Mine']);
  });

  it('is empty for a player with no colonies', () => {
    expect(ownedPlanetsFor('usr_me', [planet({ userid: 'usr_rival' })])).toEqual([]);
  });

  it('sorts by name, then by sector, so two planets of the same name stay apart', () => {
    const list = ownedPlanetsFor('usr_me', [
      planet({ userid: 'usr_me', name: 'zygor', xsect: 5, ysect: 0 }),
      planet({ userid: 'usr_me', name: 'Alpha', xsect: 9, ysect: 9 }),
      planet({ userid: 'usr_me', name: 'Zygor', xsect: -3, ysect: 2 }),
    ]);
    expect(list.map((p) => `${p.name}@${p.xsect}`)).toEqual(['Alpha@9', 'Zygor@-3', 'zygor@5']);
  });

  it('shapes the planet as exactly the calculator\'s input', () => {
    const qty: bigint[] = []; qty[I_MEN] = 424_242n; qty[I_FOOD] = 30_000n;
    const rate: number[] = []; rate[I_GOLD] = 2; rate[I_FOOD] = 23;
    const [p] = ownedPlanetsFor('usr_me', [planet({
      userid: 'usr_me', name: 'Home', xsect: 3, ysect: -5, plnum: 2,
      enviorn: 3, resource: 1, taxrate: 15, cash: 12_345n, qty, rate,
    })]);
    expect(p).toMatchObject({ xsect: 3, ysect: -5, plnum: 2, name: 'Home' });
    expect(p.input.stock).toHaveLength(NUMITEMS);
    expect(p.input.stock[I_MEN]).toBe(424_242);
    expect(p.input.stock[I_FOOD]).toBe(30_000);
    expect(p.input.rates[I_GOLD]).toBe(2);
    expect(p.input.rates[I_FOOD]).toBe(23);
    expect(p.input).toMatchObject({ enviorn: 3, resource: 1, taxrate: 15, planetCash: 12_345 });
  });

  it('does not carry anything the calculator does not take', () => {
    // Password, beacon, spy owner and team code are not planning inputs, and
    // the password in particular must never leave the server this way.
    const [p] = ownedPlanetsFor('usr_me', [planet({ userid: 'usr_me', password: 'secret' })]);
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(Object.keys(p).sort()).toEqual(['input', 'name', 'plnum', 'xsect', 'ysect']);
  });
});

describe('MyPlanetsController', () => {
  it('answers for the account in the token, and only that account', () => {
    const planets = {
      all: () => [
        planet({ userid: 'usr_me', name: 'Mine' }),
        planet({ userid: 'usr_rival', name: 'Theirs' }),
      ],
    } as unknown as PlanetStateService;
    const controller = new MyPlanetsController(planets);
    const list = controller.list({ user: { sub: 'usr_me', username: 'me' } });
    expect(list.map((p) => p.name)).toEqual(['Mine']);
  });

  it('is behind the JWT guard', () => {
    const guards = Reflect.getMetadata('__guards__', MyPlanetsController) as unknown[] | undefined;
    expect(guards?.length ?? 0).toBeGreaterThan(0);
  });
});
