/**
 * A planet with no live owner is not sent mail.
 *
 * Canon writes the letter anyway — `mailit` takes `plptr->userid` verbatim,
 * "**Free**" included (GEPLANET.C:211, :246, :313-326) — and then the midnight
 * job throws it away unread:
 *
 *   if (gemsg->userto[0] == '*')   // non-live player
 *       delbtv();
 *   -- GEMAIN.C:1195-1196
 *
 * So in the original the notice exists for at most a day and no player can ever
 * read it, because no player can hold a `*`-prefixed userid. We store mail in
 * Postgres with a foreign key to User, which "**Free**" has no row for, so the
 * insert threw on every tick a revolted colony starved:
 *
 *   ERROR [PlanetEconomyService] Starvation mail failed for **Free** re
 *   Korrindar: PrismaClientKnownRequestError
 *
 * Caught and logged, so nothing broke — but it fired four times a day per
 * abandoned colony and buried real errors in the log. Observed on the live
 * server after two test players' planets went free.
 *
 * Skipping the insert is observationally identical to canon and uses canon's
 * own test for a non-live recipient: the leading `*`. Guarding at
 * `insertDistressMail` rather than the three call sites means production-cap
 * and spy-intel notices are covered by the same rule.
 */

import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { FREE_PLANET_OWNER } from '../../../src/game/planet/planet-economy';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Random } from '../../../src/game/combat/random.port';
import { NUMITEMS, I_MEN, I_TROOPS, I_FOOD } from '../../../src/game/constants/items';

function makePlanet(over: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: 0, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  // Starving: troops and colonists both far above the food stock.
  items[I_MEN].qty = 40_000n;
  items[I_TROOPS].qty = 20_000n;
  items[I_FOOD].qty = 0n;
  return {
    xsect: 1, ysect: 7, plnum: 1, type: 1, xcoord: 1.5, ycoord: 7.5,
    userid: FREE_PLANET_OWNER, name: 'Korrindar',
    enviorn: 2, resource: 2, cash: 0n, debt: 0n, tax: 0n, taxrate: 100,
    warnings: 0, password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n, items,
    ...over,
  } as PlanetState;
}

function build() {
  const created: Array<{ userid: string }> = [];
  const prisma = {
    mailStat: { create: vi.fn((args: { data: { userid: string } }) => {
      created.push(args.data);
      return Promise.resolve({});
    }) },
  } as unknown as PrismaService;
  const svc = new PlanetEconomyService({ next: () => 0.5 } as Random, prisma);
  return { svc, created };
}

describe('mail is not written to a non-live recipient (GEMAIN.C:1195-1196)', () => {
  it('a starving **Free** colony sends nothing', async () => {
    const { svc, created } = build();

    await svc.applyTick(makePlanet());

    expect(created).toHaveLength(0);
  });

  it('a real owner still gets the starvation notice', async () => {
    const { svc, created } = build();

    await svc.applyTick(makePlanet({ userid: 'usr_real' }));

    expect(created.length).toBeGreaterThan(0);
    expect(created.every((m) => m.userid === 'usr_real')).toBe(true);
  });

  it('any *-prefixed recipient is treated as non-live, as canon tests it', async () => {
    const { svc, created } = build();

    await svc.applyTick(makePlanet({ userid: '*gone*' }));

    expect(created).toHaveLength(0);
  });
});
