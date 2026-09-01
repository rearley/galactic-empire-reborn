/**
 * T013 / T017 / T027 / T039 / T048 — PlanetStateService unit tests.
 * Covers: hydration, get/all/size, runSerialized FIFO,
 * claim(), buy(), sell(), runEconomicTickFor(), applyAdminChange(), withdrawTax().
 */

import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { planetKey, PlanetState } from '../../src/game/planet/planet-state.types';
import { NUMITEMS, I_FOOD, I_MEN } from '../../src/game/constants/items';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, (_, i) => ({
    qty: 1000n,
    rate: 10,
    sell: true,
    reserve: 0,
    markup2a: 5,
    sold2a: 0n,
  }));
  return {
    xsect: 1, ysect: 1, plnum: 1,
    type: 2, xcoord: 1.5, ycoord: 1.5,
    userid: null, name: '',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

function makePrisma(planets: PlanetState[]) {
  return {
    planet: {
      findMany: jest.fn().mockResolvedValue(
        planets.map((p) => ({
          ...p,
          userid: p.userid,
          itemsQty: p.items.map((it) => it.qty),
          itemsRate: p.items.map((it) => it.rate),
          itemsSell: p.items.map((it) => (it.sell ? 1 : 0)),
          itemsReserve: p.items.map((it) => it.reserve),
          itemsMarkup2a: p.items.map((it) => it.markup2a),
          itemsSold2a: p.items.map((it) => it.sold2a),
        })),
      ),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // claim/abandon keep the owner's planet counter in step (C: wonplnt()).
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

function makeShips(items?: bigint[]) {
  const ship = {
    userid: 'u1',
    shipno: 1,
    items: items ?? Array(NUMITEMS).fill(0n),
    dirty: false,
  };
  return {
    get: jest.fn().mockReturnValue(ship),
    mutate: jest.fn().mockImplementation((_uid: string, _shipno: number, fn: (s: typeof ship) => void) => {
      fn(ship);
      ship.dirty = true;
      return ship;
    }),
  };
}

// ── Hydration ─────────────────────────────────────────────────────────────────

describe('PlanetStateService — hydration', () => {
  it('hydrates planet count matching seeded rows', async () => {
    const planets = [makePlanet({ xsect: 0, ysect: 0, plnum: 1 }), makePlanet({ xsect: 1, ysect: 1, plnum: 1 })];
    const prisma = makePrisma(planets);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    expect(svc.size()).toBe(2);
  });

  it('get() returns the right state', async () => {
    const p = makePlanet({ xsect: 5, ysect: 3, plnum: 2, name: 'Tatooine', userid: 'u1' });
    const prisma = makePrisma([p]);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    const result = svc.get(5, 3, 2);
    expect(result?.name).toBe('Tatooine');
    expect(result?.userid).toBe('u1');
  });

  it('all() and size() are consistent', async () => {
    const planets = [
      makePlanet({ xsect: 1, ysect: 1, plnum: 1 }),
      makePlanet({ xsect: 2, ysect: 2, plnum: 1 }),
      makePlanet({ xsect: 3, ysect: 3, plnum: 1 }),
    ];
    const prisma = makePrisma(planets);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    expect(svc.all().length).toBe(svc.size());
    expect(svc.size()).toBe(3);
  });
});

// ── runSerialized FIFO ────────────────────────────────────────────────────────

describe('PlanetStateService — runSerialized preserves FIFO', () => {
  it('serializes concurrent operations on the same key', async () => {
    const planet = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: null });
    const prisma = makePrisma([planet]);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();

    const key = planetKey(0, 0, 1);
    const order: number[] = [];

    // Access private runSerialized via cast for testing
    const run = (svc as any).runSerialized.bind(svc) as (
      k: string,
      fn: () => Promise<unknown>,
    ) => Promise<unknown>;

    const p1 = run(key, async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    const p2 = run(key, async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });
});

// ── claim() ───────────────────────────────────────────────────────────────────

describe('PlanetStateService — claim()', () => {
  async function setup(overrides: Partial<PlanetState> = {}) {
    // Sector (5,7), not (0,0): nothing in the neutral zone is claimable, so a
    // 0,0 fixture would exercise that guard instead of the claim logic here.
    const planet = makePlanet({ xsect: 5, ysect: 7, plnum: 1, ...overrides });
    const prisma = makePrisma([planet]);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    return { svc, prisma };
  }

  it('happy path mutates in-memory + flushes to Postgres', async () => {
    const { svc, prisma } = await setup({ userid: null });
    const result = await svc.claim(5, 7, 1, 'u1', 'Aurora');
    expect(result).toEqual({ ok: true });
    expect(svc.get(5, 7, 1)?.userid).toBe('u1');
    expect(svc.get(5, 7, 1)?.name).toBe('Aurora');
    expect(prisma.planet.update).toHaveBeenCalledTimes(1);
  });

  it('returns OWNED if planet already has a userid', async () => {
    const { svc } = await setup({ userid: 'existing' });
    const result = await svc.claim(5, 7, 1, 'u2', 'Nova');
    expect(result).toEqual({ ok: false, reason: 'OWNED' });
  });

  it('returns INVALID_NAME for empty name', async () => {
    const { svc } = await setup({ userid: null });
    const result = await svc.claim(5, 7, 1, 'u1', '');
    expect(result).toEqual({ ok: false, reason: 'INVALID_NAME' });
  });

  it('returns INVALID_NAME for name > 19 chars', async () => {
    const { svc } = await setup({ userid: null });
    const result = await svc.claim(5, 7, 1, 'u1', 'A'.repeat(20));
    expect(result).toEqual({ ok: false, reason: 'INVALID_NAME' });
  });

  it('returns INVALID_NAME for non-printable bytes', async () => {
    const { svc } = await setup({ userid: null });
    const result = await svc.claim(5, 7, 1, 'u1', 'Bad\x00Name');
    expect(result).toEqual({ ok: false, reason: 'INVALID_NAME' });
  });

  it('returns NOT_FOUND for unknown key', async () => {
    const { svc } = await setup();
    const result = await svc.claim(99, 99, 9, 'u1', 'Nowhere');
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('serializes concurrent claim attempts on same key', async () => {
    const { svc } = await setup({ userid: null });
    const [r1, r2] = await Promise.all([
      svc.claim(5, 7, 1, 'u1', 'First'),
      svc.claim(5, 7, 1, 'u2', 'Second'),
    ]);
    // Exactly one should succeed and one should get OWNED
    const results = [r1, r2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });
});

// ── buy() ─────────────────────────────────────────────────────────────────────

describe('PlanetStateService — buy()', () => {
  async function setup(overrides: Partial<PlanetState> = {}) {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'owner', ...overrides });
    const prisma = makePrisma([planet]);
    const ships = makeShips();
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    return { svc, prisma };
  }

  it('happy path returns ok, decrements planet qty, calls prisma.planet.update', async () => {
    const { svc, prisma } = await setup();
    const key = planetKey(1, 1, 1);
    const result = await svc.buy(key, 'owner', I_FOOD, 10, 100, 10_000_000n);
    expect(result).toMatchObject({ ok: true, transferred: 10 });
    expect(svc.get(1, 1, 1)?.items[I_FOOD].qty).toBe(990n);
    expect(prisma.planet.update).toHaveBeenCalledTimes(1);
  });

  it('returns SELL_FLAG_OFF when item sell=false', async () => {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'owner' });
    planet.items[I_FOOD].sell = false;
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    const result = await svc.buy(planetKey(1, 1, 1), 'buyer', I_FOOD, 10, 100, 10_000_000n);
    expect(result).toEqual({ ok: false, reason: 'SELL_FLAG_OFF' });
  });

  it('returns AT_RESERVE when available qty <= reserve', async () => {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'owner' });
    planet.items[I_FOOD].qty = 100n;
    planet.items[I_FOOD].reserve = 100;
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    const result = await svc.buy(planetKey(1, 1, 1), 'buyer', I_FOOD, 10, 100, 10_000_000n);
    expect(result).toEqual({ ok: false, reason: 'AT_RESERVE' });
  });

  it('neutral zone buy does not mutate planet state', async () => {
    const planet = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: null });
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    const result = await svc.buy(planetKey(0, 0, 1), 'buyer', I_FOOD, 10, 100, 10_000_000n);
    expect(result).toMatchObject({ ok: true, transferred: 10 });
    // Planet qty unchanged
    expect(svc.get(0, 0, 1)?.items[I_FOOD].qty).toBe(1000n);
    // No prisma update called
    expect(prisma.planet.update).not.toHaveBeenCalled();
  });

  it('NOT_FOUND for unknown key', async () => {
    const { svc } = await setup();
    const result = await svc.buy('99:99:9', 'owner', I_FOOD, 10, 100, 10_000_000n);
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

// ── sell() ────────────────────────────────────────────────────────────────────

describe('PlanetStateService — sell()', () => {
  async function setup(shipItems?: bigint[]) {
    const planet = makePlanet({ xsect: 0, ysect: 0, plnum: 1 });
    const prisma = makePrisma([planet]);
    const ships = makeShips(shipItems ?? Array.from({ length: NUMITEMS }, (_, i) => i === I_FOOD ? 100n : 0n));
    const svc = new PlanetStateService(prisma as any, ships as any);
    await svc.onModuleInit();
    return { svc, prisma, ships };
  }

  it('happy path decrements ship cargo and returns proceeds', async () => {
    const { svc, ships } = await setup();
    const result = await svc.sell(planetKey(0, 0, 1), 'u1', 1, I_FOOD, 10);
    expect(result).toMatchObject({ ok: true, transferred: 10 });
    expect(ships.mutate).toHaveBeenCalledTimes(1);
  });

  it('returns NOT_NEUTRAL_ZONE for non-neutral planet', async () => {
    const planet = makePlanet({ xsect: 5, ysect: 5, plnum: 1 });
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    const result = await svc.sell(planetKey(5, 5, 1), 'u1', 1, I_FOOD, 10);
    expect(result).toEqual({ ok: false, reason: 'NOT_NEUTRAL_ZONE' });
  });

  it('returns NOT_PLNUM_1 for neutral zone planet with plnum != 1', async () => {
    const planet = makePlanet({ xsect: 0, ysect: 0, plnum: 2 });
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    const result = await svc.sell(planetKey(0, 0, 2), 'u1', 1, I_FOOD, 10);
    expect(result).toEqual({ ok: false, reason: 'NOT_PLNUM_1' });
  });

  it('returns INSUFFICIENT_CARGO when ship does not have enough', async () => {
    const { svc } = await setup(Array(NUMITEMS).fill(0n));
    const result = await svc.sell(planetKey(0, 0, 1), 'u1', 1, I_FOOD, 10);
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_CARGO' });
  });

  it('concurrent sell: only one succeeds when cargo is exactly enough for one', async () => {
    const items = Array.from({ length: NUMITEMS }, (_, i) => i === I_FOOD ? 10n : 0n);
    const { svc } = await setup(items);
    const key = planetKey(0, 0, 1);
    const [r1, r2] = await Promise.all([
      svc.sell(key, 'u1', 1, I_FOOD, 10),
      svc.sell(key, 'u1', 1, I_FOOD, 10),
    ]);
    const successes = [r1, r2].filter((r) => r.ok);
    const failures = [r1, r2].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('no prisma.planet.update is called on successful sell', async () => {
    const { svc, prisma } = await setup();
    await svc.sell(planetKey(0, 0, 1), 'u1', 1, I_FOOD, 5);
    expect(prisma.planet.update).not.toHaveBeenCalled();
  });
});

// ── runEconomicTickFor() ───────────────────────────────────────────────────────

describe('PlanetStateService — runEconomicTickFor()', () => {
  it('produces a new state and calls prisma.planet.update', async () => {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'u1' });
    planet.items[I_MEN].qty = 100_000n;
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();

    await svc.runEconomicTickFor(planetKey(1, 1, 1));
    expect(prisma.planet.update).toHaveBeenCalledTimes(1);
  });

  it('NOT_FOUND logs a warning but does not throw', async () => {
    const prisma = makePrisma([]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    await expect(svc.runEconomicTickFor('99:99:9')).resolves.toBeUndefined();
  });
});

// ── applyAdminChange() ────────────────────────────────────────────────────────

describe('PlanetStateService — applyAdminChange()', () => {
  async function setup() {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'owner' });
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    return { svc, prisma };
  }

  it('NOT_OWNER when requester is not owner', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'intruder', { type: 'beacon', value: 'hi' });
    expect(result).toEqual({ ok: false, reason: 'NOT_OWNER' });
  });

  it('sets taxrate in bounds', async () => {
    const { svc, prisma } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'taxrate', value: 50 });
    expect(result).toEqual({ ok: true });
    expect(svc.get(1, 1, 1)?.taxrate).toBe(50);
    expect(prisma.planet.update).toHaveBeenCalled();
  });

  it('INVALID when taxrate > 119', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'taxrate', value: 120 });
    expect(result).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('sets beacon', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'beacon', value: 'Hello galaxy' });
    expect(result).toEqual({ ok: true });
    expect(svc.get(1, 1, 1)?.beacon).toBe('Hello galaxy');
  });

  it('INVALID when beacon > 75 chars', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'beacon', value: 'A'.repeat(76) });
    expect(result).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('sets password', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'password', value: 'secret' });
    expect(result).toEqual({ ok: true });
    expect(svc.get(1, 1, 1)?.password).toBe('secret');
  });

  it('INVALID when password > 10 chars', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'password', value: 'tooooooolong' });
    expect(result).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('sets item rate', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'rate', itemIndex: I_FOOD, value: 25 });
    expect(result).toEqual({ ok: true });
    expect(svc.get(1, 1, 1)?.items[I_FOOD].rate).toBe(25);
  });

  it('sets item sellflag', async () => {
    const { svc } = await setup();
    const result = await svc.applyAdminChange(planetKey(1, 1, 1), 'owner', { type: 'sellflag', itemIndex: I_FOOD, value: false });
    expect(result).toEqual({ ok: true });
    expect(svc.get(1, 1, 1)?.items[I_FOOD].sell).toBe(false);
  });
});

// ── withdrawTax() ─────────────────────────────────────────────────────────────

describe('PlanetStateService — withdrawTax()', () => {
  async function setup(tax = 500n) {
    const planet = makePlanet({ xsect: 1, ysect: 1, plnum: 1, userid: 'owner', tax });
    const prisma = makePrisma([planet]);
    const svc = new PlanetStateService(prisma as any, makeShips() as any);
    await svc.onModuleInit();
    return { svc, prisma };
  }

  it('NOT_OWNER for non-owner', async () => {
    const { svc } = await setup();
    const result = await svc.withdrawTax(planetKey(1, 1, 1), 'intruder');
    expect(result).toEqual({ ok: false, reason: 'NOT_OWNER' });
  });

  it('happy path returns amount, zeroes planet.tax, flushes', async () => {
    const { svc, prisma } = await setup(500n);
    const result = await svc.withdrawTax(planetKey(1, 1, 1), 'owner');
    expect(result).toEqual({ ok: true, amount: 500n });
    expect(svc.get(1, 1, 1)?.tax).toBe(0n);
    expect(prisma.planet.update).toHaveBeenCalledTimes(1);
  });

  it('zero tax returns ok with amount 0n', async () => {
    const { svc } = await setup(0n);
    const result = await svc.withdrawTax(planetKey(1, 1, 1), 'owner');
    expect(result).toEqual({ ok: true, amount: 0n });
  });
});

// ── Reload after an out-of-band DB write ─────────────────────────────────────

/**
 * Midnight's `refreshNeutralZone` restocks Zygor-3 and Nexus Prime by writing
 * Postgres directly. Its comment claimed that was "cosmetic but faithful"
 * because purchases never deplete neutral-zone stock — true, but the ECONOMY
 * tick does: the posts hold 1,032,000 men, so `shouldRunEconomy` is true for
 * them and every PLANTOCK consumes their food and starves their troops like
 * any other colony's.
 *
 * The live game reads PlanetStateService, never the row. So the hub shop drained
 * over days of uptime while midnight dutifully refilled a copy nobody reads,
 * and only a server restart re-hydrated it. Found in play: Zygor refused to
 * sell 100 troops while its row held 1,032,000.
 */
describe('PlanetStateService — reloadPlanet', () => {
  it('picks up a row rewritten outside the service', async () => {
    const planets = [makePlanet({ xsect: 0, ysect: 0, plnum: 1, name: 'Zygor-3' })];
    const prisma = makePrisma(planets);
    const svc = new PlanetStateService(prisma as never, makeShips() as never);
    await svc.onModuleInit();

    expect(svc.get(0, 0, 1)?.items[I_FOOD].qty).toBe(1000n);

    // Midnight restocks the row behind the service's back.
    prisma.planet.findFirst = jest.fn().mockResolvedValue({
      ...planets[0],
      name: 'Zygor-3',
      itemsQty: planets[0].items.map(() => 1_032_000n),
      itemsRate: planets[0].items.map((it) => it.rate),
      itemsSell: planets[0].items.map(() => 1),
      itemsReserve: planets[0].items.map(() => 0),
      itemsMarkup2a: planets[0].items.map((it) => it.markup2a),
      itemsSold2a: planets[0].items.map((it) => it.sold2a),
    });

    await svc.reloadPlanet(0, 0, 1);

    expect(svc.get(0, 0, 1)?.items[I_FOOD].qty).toBe(1_032_000n);
    expect(svc.get(0, 0, 1)?.items[I_MEN].qty).toBe(1_032_000n);
  });

  it('leaves the map alone when the row is gone', async () => {
    const planets = [makePlanet({ xsect: 0, ysect: 0, plnum: 1 })];
    const prisma = makePrisma(planets);
    const svc = new PlanetStateService(prisma as never, makeShips() as never);
    await svc.onModuleInit();

    prisma.planet.findFirst = jest.fn().mockResolvedValue(null);
    await svc.reloadPlanet(0, 0, 1);

    expect(svc.get(0, 0, 1)?.items[I_FOOD].qty).toBe(1000n);
  });
});
