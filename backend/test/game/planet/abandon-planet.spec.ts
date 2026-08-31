import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';

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
  update: jest.Mock;
  userUpdate: jest.Mock;
} {
  const update = jest.fn().mockResolvedValue({});
  const userUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    planet: { update, findMany: jest.fn().mockResolvedValue([]) },
    user: { updateMany: userUpdate },
  } as never;
  const svc = new PlanetStateService(prisma, { get: () => undefined } as never);
  if (planet) {
    (svc as unknown as { map: Map<string, PlanetState> }).map.set('4:2:1', planet);
  }
  return { svc, update, userUpdate };
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
});
