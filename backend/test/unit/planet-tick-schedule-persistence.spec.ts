/**
 * The production schedule must survive a restart.
 *
 * `PlanetTickService` decided when a planet was next due from an in-memory
 * `lastTickMs` Map. Boot cleared it, so every populated planet had
 * `last === undefined` on the first sweep and was immediately due — each
 * restart handed the whole galaxy a free PLANTOCK. Six deploys in an evening
 * was three extra hours of economy, permanently in the ground.
 *
 * The schedule now lives on the planet itself as `lastTickAt`, a real column,
 * so elapsed time is measured against the wall clock rather than against
 * process uptime.
 *
 * @see docs/DECISIONS.md 2026-09-06 — planet tick schedule is persisted
 */

import { PlanetTickService } from '../../src/game/planet/planet-tick.service';
import { PLANTOCK_SECONDS } from '../../src/game/constants';
import { PlanetState } from '../../src/game/planet/planet-state.types';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { stateToPrismaUpdate } from '../../src/game/planet/planet-state.mappers';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { NUMITEMS } from '../../src/game/constants/items';

type TestPlanet = Pick<PlanetState, 'xsect' | 'ysect' | 'plnum' | 'userid' | 'lastTickAt'> & {
  items: Array<{ qty: bigint }>;
};

class FakePlanets {
  readonly ticked: string[] = [];
  constructor(private readonly planets: TestPlanet[]) {}
  all() { return this.planets; }
  async runEconomicTickFor(key: string): Promise<void> { this.ticked.push(key); }
}

/** A populated, owned planet last updated `agoSecs` before `nowMs`. */
function planetLastTicked(agoSecs: number | null, nowMs: number): TestPlanet {
  return {
    xsect: 1, ysect: 1, plnum: 1, userid: 'owner',
    lastTickAt: agoSecs === null ? null : new Date(nowMs - agoSecs * 1000),
    items: Array.from({ length: 14 }, () => ({ qty: 1000n })),
  };
}

/** A service built fresh, as it is on every boot. */
function bootWith(planets: TestPlanet[], nowMs: number) {
  const fake = new FakePlanets(planets);
  const svc = new PlanetTickService(
    fake as never,
    { subscribe: jest.fn(), startPlanetUpdateTimer: jest.fn() } as never,
    () => nowMs,
  );
  return { svc, fake, advance: () => (svc as unknown as { advance(): Promise<void> }).advance() };
}

describe('planet production schedule survives a restart', () => {
  const NOW = 1_757_000_000_000;

  it('does not tick a planet updated five minutes before the restart', async () => {
    const { fake, advance } = bootWith([planetLastTicked(5 * 60, NOW)], NOW);

    await advance();

    expect(fake.ticked).toEqual([]);
  });

  it('ticks a planet that came due while the server was down', async () => {
    const { fake, advance } = bootWith([planetLastTicked(PLANTOCK_SECONDS + 1, NOW)], NOW);

    await advance();

    expect(fake.ticked).toEqual(['1:1:1']);
  });

  it('ticks a planet that has never been updated', async () => {
    // A freshly generated galaxy, or a colony claimed before the column existed.
    const { fake, advance } = bootWith([planetLastTicked(null, NOW)], NOW);

    await advance();

    expect(fake.ticked).toEqual(['1:1:1']);
  });

  it('stamps the planet so a second service instance sees the same schedule', async () => {
    // Two boots back to back — the second must not re-tick what the first did.
    const planets = [planetLastTicked(null, NOW)];
    await bootWith(planets, NOW).advance();

    const second = bootWith(planets, NOW);
    await second.advance();

    expect(second.fake.ticked).toEqual([]);
  });
});


/**
 * The stamp is worthless unless it reaches Postgres. `runEconomicTickFor`
 * already flushes the whole planet after the tick, so the schedule rides along
 * in that same write — no second round-trip, and no window where the stock has
 * been updated but the schedule has not.
 */
describe('the schedule reaches Postgres', () => {
  function colonyRow() {
    const items = Array.from({ length: NUMITEMS }, () => ({
      qty: 1000n, rate: 0, sell: true, reserve: 0, markup2a: 5, sold2a: 0n,
    }));
    const state: PlanetState = {
      xsect: 3, ysect: 4, plnum: 1, type: 2, xcoord: 3.5, ycoord: 4.5,
      userid: 'owner', name: 'Anchorage', enviorn: 2, resource: 2,
      cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0, password: '',
      lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
      lastTickAt: null, items,
    };
    return {
      ...stateToPrismaUpdate(state),
      ...state,
      itemsQty: items.map((i) => i.qty),
      itemsRate: items.map((i) => i.rate),
      itemsSell: items.map((i) => (i.sell ? 1 : 0)),
      itemsReserve: items.map((i) => i.reserve),
      itemsMarkup2a: items.map((i) => i.markup2a),
      itemsSold2a: items.map((i) => i.sold2a),
    };
  }

  it('writes lastTickAt in the same update as the production result', async () => {
    const NOW = 1_757_000_000_000;
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      planet: { findMany: jest.fn().mockResolvedValue([colonyRow()]), update },
    } as unknown as PrismaService;
    const ships = { get: () => undefined, mutate: () => undefined } as unknown as ShipStateService;

    const planets = new PlanetStateService(prisma, ships);
    await planets.onModuleInit();

    const tick = new PlanetTickService(
      planets,
      { subscribe: jest.fn(), startPlanetUpdateTimer: jest.fn() } as never,
      () => NOW,
    );
    await (tick as unknown as { advance(): Promise<void> }).advance();

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0].data as { lastTickAt: Date | null };
    expect(written.lastTickAt).toEqual(new Date(NOW));
  });
});
