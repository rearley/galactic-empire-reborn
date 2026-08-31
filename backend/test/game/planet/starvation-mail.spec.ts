import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { Random } from '../../../src/game/combat/random.port';
import { I_FOOD, I_MEN, I_TROOPS, NUMITEMS } from '../../../src/game/constants/items';
import { MAIL_CLASS_DISTRESS } from '../../../src/game/constants';

/**
 * GEPLANET.C:205-254 — when a colony runs out of food it loses an eighth of its
 * troops, then an eighth of its men, and C mails the owner a distress message
 * each time (MESG06 / MESG07). The port did the killing silently, so a colony
 * could starve to nothing without the owner ever being told.
 *
 * The mail must land in MailStat: that is the table `mai` reads. The revolt
 * notice wrote to Mail instead and was therefore invisible to the player.
 */
function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  return {
    xsect: 4, ysect: 9, plnum: 2,
    type: 2, xcoord: 4.5, ycoord: 9.5,
    userid: 'owner1', name: 'Hungry Rock',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

const noRevolt: Random = { next: () => 0.99 };

function makeService(): { svc: PlanetEconomyService; create: jest.Mock } {
  const create = jest.fn().mockResolvedValue({});
  const prisma = { mailStat: { create }, mail: { create: jest.fn() } } as never;
  return { svc: new PlanetEconomyService(noRevolt, prisma), create };
}

/** Lets the fire-and-forget mail insert settle before assertions. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('PlanetEconomyService — starvation distress mail', () => {
  it('mails the owner when men starve', async () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 8000n;
    planet.items[I_FOOD].qty = 0n;

    const { svc, create } = makeService();
    const { state } = await svc.applyTick(planet);
    await flush();

    expect(state.items[I_MEN].qty).toBe(7000n); // 8000 - 8000/8
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row.userid).toBe('owner1');
    expect(row.class).toBe(MAIL_CLASS_DISTRESS);
    expect(row.name1).toBe('Hungry Rock');
    expect(row.int1).toBe(4);
    expect(row.int2).toBe(9);
    expect(row.cash).toBe(1000n); // men lost
  });

  it('mails the owner when troops starve, separately from men', async () => {
    const planet = makePlanet();
    planet.items[I_TROOPS].qty = 8000n;
    planet.items[I_MEN].qty = 8000n;
    planet.items[I_FOOD].qty = 0n;

    const { svc, create } = makeService();
    await svc.applyTick(planet);
    await flush();

    expect(create).toHaveBeenCalledTimes(2);
    const topics = create.mock.calls.map((c) => c[0].data.topic);
    expect(new Set(topics).size).toBe(2);
  });

  it('sends nothing when the colony is fed', async () => {
    const planet = makePlanet();
    planet.items[I_MEN].qty = 100n;
    planet.items[I_FOOD].qty = 5000n;

    const { svc, create } = makeService();
    await svc.applyTick(planet);
    await flush();

    expect(create).not.toHaveBeenCalled();
  });

  it('sends nothing for an unowned planet', async () => {
    const planet = makePlanet({ userid: null });
    planet.items[I_MEN].qty = 8000n;
    planet.items[I_FOOD].qty = 0n;

    const { svc, create } = makeService();
    await svc.applyTick(planet);
    await flush();

    expect(create).not.toHaveBeenCalled();
  });
});
