/**
 * T044 — PlanetTickService ticks every owned planet on each PLANET_UPDATE firing,
 * at a fixed PLANTIME cadence (GEMAIN.H:136 PLANTIME 55).
 */

import { PlanetTickService } from '../../src/game/planet/planet-tick.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { planetKey } from '../../src/game/planet/planet-state.types';
import { PLANTIME } from '../../src/game/constants';

function buildMocks(fakePlanets: Array<{ xsect: number; ysect: number; plnum: number }>) {
  const tickedKeys: string[] = [];

  const planetServiceMock = {
    all: jest.fn().mockReturnValue(fakePlanets),
    runEconomicTickFor: jest.fn().mockImplementation((k: string) => {
      tickedKeys.push(k);
      return Promise.resolve();
    }),
  } as unknown as PlanetStateService;

  let capturedHandler: (() => Promise<void>) | undefined;
  const tickServiceMock = {
    subscribe: jest.fn().mockImplementation((kind: TickKind, handler: () => Promise<void>) => {
      if (kind === TickKind.PLANET_UPDATE) capturedHandler = handler;
      return () => {};
    }),
    startPlanetUpdateTimer: jest.fn(),
  } as unknown as TickService;

  return {
    planetServiceMock,
    tickServiceMock,
    tickedKeys,
    getHandler: () => capturedHandler,
  };
}

describe('T044 — PlanetTickService all-planets-per-tick', () => {
  const fakePlanets = [
    { xsect: 1, ysect: 0, plnum: 1 },
    { xsect: 1, ysect: 0, plnum: 2 },
    { xsect: 2, ysect: 1, plnum: 1 },
  ];

  it('ticks every owned planet exactly once per firing (N=3)', async () => {
    const { planetServiceMock, tickServiceMock, tickedKeys, getHandler } =
      buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler();
    expect(handler).toBeDefined();

    await handler!();

    expect(tickedKeys).toHaveLength(fakePlanets.length);
    for (const p of fakePlanets) {
      expect(tickedKeys).toContain(planetKey(p.xsect, p.ysect, p.plnum));
    }
  });

  it('each firing ticks the full set in the same order', async () => {
    const { planetServiceMock, tickServiceMock, tickedKeys, getHandler } =
      buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler()!;
    const N = fakePlanets.length;

    // Fire 2 ticks — each ticks the whole set
    await handler();
    await handler();

    expect(tickedKeys).toHaveLength(N * 2);

    // Both firings must visit the same keys in the same order
    const firstCycle = tickedKeys.slice(0, N);
    const secondCycle = tickedKeys.slice(N, N * 2);
    expect(secondCycle).toEqual(firstCycle);
  });

  it('empty planet list: no runEconomicTickFor calls', async () => {
    const { planetServiceMock, tickServiceMock, getHandler } = buildMocks([]);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler()!;
    // Fire a few times — nothing should blow up, nothing should be called
    for (let i = 0; i < 5; i++) await handler();

    expect(planetServiceMock.runEconomicTickFor).not.toHaveBeenCalled();
  });

  it('startPlanetUpdateTimer called with the fixed PLANTIME cadence (55 000 ms)', async () => {
    const { planetServiceMock, tickServiceMock } = buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const expectedMs = PLANTIME * 1000; // 55 000

    expect(tickServiceMock.startPlanetUpdateTimer).toHaveBeenCalledWith(expectedMs);
  });
});
