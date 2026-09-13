import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { NUMITEMS, I_MEN, I_FOOD } from '../../../src/game/constants/items';
import type { Mock } from 'vitest';

/**
 * GECMDS.C:3420 cmd_abandon — the canonical `aba`. In orbit over a planet you
 * own, it clears `plptr->userid` and decrements the owner's planet counter.
 * Nothing else about the planet is touched: name, stock, rates, cash and
 * password all survive, so whoever claims it next inherits the colony.
 */
function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 4, ysect: 2, plnum: 1,
    type: 2, xcoord: 4.5, ycoord: 2.5,
    userid: 'owner1', name: 'Aurora',
    enviorn: 1, resource: 1,
    cash: 500n, debt: 0n, tax: 40n, taxrate: 15,
    warnings: 0, password: 'sesame', lastattack: '',
    beacon: 'keep out', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 700n, rate: 9, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeService(planet: PlanetState | null): {
  svc: PlanetStateService;
  update: Mock;
  userUpdate: Mock;
  userUpdateOne: Mock;
} {
  const update = vi.fn().mockResolvedValue({});
  const userUpdate = vi.fn().mockResolvedValue({});
  // The counter uses two verbs by design now: `update` when a missing row is an
  // error (winning a world), `updateMany` for the floored decrement's
  // `planets: { gt: 0 }` predicate. @see issue #15
  const userUpdateOne = vi.fn().mockResolvedValue({});
  const prisma = {
    planet: { update, findMany: vi.fn().mockResolvedValue([]) },
    user: { updateMany: userUpdate, update: userUpdateOne },
  } as never;
  const svc = new PlanetStateService(prisma, { get: () => undefined } as never);
  if (planet) {
    (svc as unknown as { map: Map<string, PlanetState> }).map.set('4:2:1', planet);
  }
  return { svc, update, userUpdate, userUpdateOne };
}

describe('PlanetStateService.abandonPlanet — GECMDS.C:3420', () => {
  it('releases a planet the caller owns and reports its name', async () => {
    const planet = makePlanet();
    const { svc } = makeService(planet);

    const result = await svc.abandonPlanet(4, 2, 1, 'owner1');

    expect(result).toEqual({ ok: true, name: 'Aurora' });
    expect(planet.userid).toBeNull();
  });

  it('leaves the colony intact for whoever claims it next', async () => {
    const planet = makePlanet();
    const { svc } = makeService(planet);

    await svc.abandonPlanet(4, 2, 1, 'owner1');

    // C clears userid and nothing else.
    expect(planet.name).toBe('Aurora');
    expect(planet.items[0].qty).toBe(700n);
    expect(planet.items[0].rate).toBe(9);
    expect(planet.cash).toBe(500n);
    expect(planet.taxrate).toBe(15);
    expect(planet.password).toBe('sesame');
  });

  it('persists the release', async () => {
    const { svc, update } = makeService(makePlanet());
    await svc.abandonPlanet(4, 2, 1, 'owner1');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("decrements the owner's planet counter, floored at zero", async () => {
    const { svc, userUpdate } = makeService(makePlanet());
    await svc.abandonPlanet(4, 2, 1, 'owner1');
    // C: `if (--waruptr->planets < 0) waruptr->planets = 0;`
    expect(userUpdate).toHaveBeenCalledWith({
      where: { userid: 'owner1', planets: { gt: 0 } },
      data: { planets: { decrement: 1 } },
    });
  });

  it("refuses a planet owned by someone else and leaves it alone", async () => {
    const planet = makePlanet({ userid: 'someone_else' });
    const { svc, update } = makeService(planet);

    const result = await svc.abandonPlanet(4, 2, 1, 'owner1');

    expect(result).toEqual({ ok: false, reason: 'NOT_OWNER' });
    expect(planet.userid).toBe('someone_else');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses an unowned planet', async () => {
    const { svc } = makeService(makePlanet({ userid: null }));
    const result = await svc.abandonPlanet(4, 2, 1, 'owner1');
    expect(result).toEqual({ ok: false, reason: 'NOT_OWNER' });
  });

  it('reports a missing planet', async () => {
    const { svc } = makeService(null);
    const result = await svc.abandonPlanet(4, 2, 1, 'owner1');
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('frees the planet for a fresh claim', async () => {
    const planet = makePlanet();
    const { svc } = makeService(planet);

    await svc.abandonPlanet(4, 2, 1, 'owner1');
    const claimed = await svc.claim(4, 2, 1, 'newowner', 'Second Chance');

    expect(claimed).toEqual({ ok: true });
    expect(planet.userid).toBe('newowner');
    expect(planet.name).toBe('Second Chance');
  });

  /**
   * C's `wonplnt()` does `++waruptr->planets` when a planet changes hands
   * (GECMDS.C:4001). The port decremented on abandon but never incremented on
   * claim, so a pilot who had just claimed their first world was told
   * "Planets: none." by `rep acc` while `pla` listed it — the counter only came
   * right at midnight, when it is rebuilt from actual ownership.
   */
  it('claiming increments the owner\'s planet counter', async () => {
    const { svc, userUpdateOne } = makeService(makePlanet({ userid: null, name: '' }));

    await svc.claim(4, 2, 1, 'newowner', 'Havenrock');

    // `update`, not `updateMany`: a claim by an account that does not exist is
    // an error, not something to absorb. @see issue #15
    expect(userUpdateOne).toHaveBeenCalledWith({
      where: { userid: 'newowner' },
      data: { planets: { increment: 1 } },
    });
  });

  it('a refused claim does not touch the counter', async () => {
    const { svc, userUpdate, userUpdateOne } = makeService(makePlanet({ userid: 'someone_else' }));

    await svc.claim(4, 2, 1, 'newowner', 'Havenrock');

    expect(userUpdate).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  /**
   * C configures a freshly claimed colony for you: `mnu_admenu1` zeroes every
   * production rate and then sets men and food to 50 (GEMAIN.C:2908-2916). The
   * port claimed the planet and left every rate at zero, so a new pilot's first
   * world sat there producing nothing until they discovered `adm rate` — and
   * nothing tells them to. It also meant a planet claimed after being abandoned
   * silently kept the previous owner's production settings.
   */
  it('sets up a fresh colony: men and food at rate 50, everything else zero', async () => {
    const planet = makePlanet({ userid: null, name: '' });
    // Leftovers from a previous owner must not carry over.
    planet.items[2] = { ...planet.items[2], rate: 44 };
    const { svc } = makeService(planet);

    await svc.claim(4, 2, 1, 'newowner', 'Havenrock');

    expect(planet.items[I_MEN].rate).toBe(50);
    expect(planet.items[I_FOOD].rate).toBe(50);
    expect(planet.items[2].rate).toBe(0);
  });

  it('leaves stock alone — only the rates are reset', async () => {
    const planet = makePlanet({ userid: null, name: '' });
    const { svc } = makeService(planet);

    await svc.claim(4, 2, 1, 'newowner', 'Havenrock');

    expect(planet.items[I_MEN].qty).toBe(700n);
  });
});
