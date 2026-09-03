/**
 * GEPLANET.C:313-326 — the production-cap notice (MESG08+i).
 *
 *   if (plptr->items[i].qty <= max && temp >= max)
 *       {
 *       temp = max;
 *       mail.class = MAIL_CLASS_PRODRPT;
 *       mail.type = MESG08+i;
 *       ...
 *       mail.long1 = max;
 *       mailit(0);
 *       }
 *
 * `i` is the item slot, so `MESG08+i` selects one of fourteen bodies:
 * MESG08 (men) through MESG19 (mines), then MESG19A (gold) and MESG19B
 * (spies) — GE/REL/MBMGEMSG.MSG:4079-4176. `max` is `(long)(maxpl[i]*fact)`,
 * the same ceiling the stock is then clamped to, and it is what the message's
 * single %s prints.
 *
 * The port clamped the stock silently, so a colony's factories shut down with
 * no notice reaching the owner at all.
 */

import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { applyEconomyTickWithLosses } from '../../../src/game/planet/planet-economy';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { Random } from '../../../src/game/combat/random.port';
import { I_FOOD, I_MEN, I_SPY, MAXPL, NUMITEMS } from '../../../src/game/constants/items';
import { MAIL_CLASS_PRODRPT } from '../../../src/game/midnight/midnight.constants';
import { PRODUCTION_CAP_MAIL_TYPES } from '../../../src/game/mail/production-cap';

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  return {
    xsect: 4, ysect: 9, plnum: 2,
    type: 2, xcoord: 4.5, ycoord: 9.5,
    userid: 'owner1', name: 'Spytown',
    enviorn: 3, resource: 3,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

/**
 * enviorn 3 + resource 3, taxrate 0, no cash =>
 *   taxfact 1, envFact (3+3+2)*.25 = 2, cash bonus off  =>  fact = 2
 * so the spy ceiling is MAXPL[13] * 2 = 10, and a million colonists at
 * rate 100 produce ~95 agents in one pass — a clean single crossing.
 */
const SPY_CAP = MAXPL[I_SPY] * 2;

function busySpyColony(): PlanetState {
  const p = makePlanet();
  p.items[I_MEN].qty = 1_000_000n;
  p.items[I_FOOD].qty = 100_000n;
  p.items[I_SPY].rate = 100;
  return p;
}

const noRevolt: Random = { next: () => 0.99 };

function makeService(): { svc: PlanetEconomyService; create: jest.Mock } {
  const create = jest.fn().mockResolvedValue({});
  const prisma = { mailStat: { create }, mail: { create: jest.fn() } } as never;
  return { svc: new PlanetEconomyService(noRevolt, prisma), create };
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('applyEconomyTickWithLosses — cap crossings', () => {
  it('reports the slot and the ceiling when production tops out', () => {
    const { state, capped } = applyEconomyTickWithLosses(busySpyColony());

    expect(state.items[I_SPY].qty).toBe(BigInt(SPY_CAP));
    expect(capped).toEqual([{ item: I_SPY, cap: SPY_CAP }]);
  });

  it('reports nothing on the next pass, with the colony sitting at the cap', () => {
    const p = busySpyColony();
    p.items[I_SPY].qty = BigInt(SPY_CAP);

    const { capped } = applyEconomyTickWithLosses(p);

    expect(capped).toEqual([]);
  });

  it('reports nothing while the stock is still climbing', () => {
    const p = busySpyColony();
    p.items[I_MEN].qty = 1_000n; // ~0.095 agents a pass — nowhere near 10

    const { capped } = applyEconomyTickWithLosses(p);

    expect(capped).toEqual([]);
  });
});

describe('PlanetEconomyService — production-cap mail', () => {
  it('mails the owner MESG08+i with the ceiling', async () => {
    const { svc, create } = makeService();
    await svc.applyTick(busySpyColony());
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row.userid).toBe('owner1');
    expect(row.class).toBe(MAIL_CLASS_PRODRPT);
    expect(row.type).toBe(PRODUCTION_CAP_MAIL_TYPES[I_SPY]);
    expect(row.name1).toBe('Spytown');
    expect(row.int1).toBe(4);
    expect(row.int2).toBe(9);
    expect(row.cash).toBe(BigInt(SPY_CAP)); // mail.long1 = max
  });

  it('does not mail again once the colony is parked at the cap', async () => {
    const p = busySpyColony();
    p.items[I_SPY].qty = BigInt(SPY_CAP);

    const { svc, create } = makeService();
    await svc.applyTick(p);
    await flush();

    expect(create).not.toHaveBeenCalled();
  });
});
