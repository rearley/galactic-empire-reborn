/**
 * T044 — PlanetTickService advances exactly one planet per PLANET_UPDATE firing in round-robin order.
 */

import { PlanetTickService } from '../../src/game/planet/planet-tick.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { planetKey } from '../../src/game/planet/planet-state.types';

const PLANTOCK_SECONDS = 1800;
const PLANTIME_MIN_SECONDS = 4;

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

describe('T044 — PlanetTickService round-robin', () => {
  const fakePlanets = [
    { xsect: 1, ysect: 0, plnum: 1 },
    { xsect: 1, ysect: 0, plnum: 2 },
    { xsect: 2, ysect: 1, plnum: 1 },
  ];

  it('each planet is ticked exactly once per N firings (N=3)', async () => {
    const { planetServiceMock, tickServiceMock, tickedKeys, getHandler } =
      buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler();
    expect(handler).toBeDefined();

    for (let i = 0; i < fakePlanets.length; i++) await handler!();

    expect(tickedKeys).toHaveLength(fakePlanets.length);
    for (const p of fakePlanets) {
      expect(tickedKeys).toContain(planetKey(p.xsect, p.ysect, p.plnum));
    }
  });

  it('fires wrap around — second cycle ticks same order', async () => {
    const { planetServiceMock, tickServiceMock, tickedKeys, getHandler } =
      buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler()!;
    const N = fakePlanets.length;

    // Fire 2 full cycles
    for (let i = 0; i < N * 2; i++) await handler();

    expect(tickedKeys).toHaveLength(N * 2);

    // First and second cycle must visit the same keys in the same order
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

  it('startPlanetUpdateTimer called with cadence based on planet count (N=3 → 600 000 ms)', async () => {
    const { planetServiceMock, tickServiceMock } = buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const N = fakePlanets.length; // 3
    const expectedIntervalSec = Math.max(
      PLANTIME_MIN_SECONDS,
      Math.floor(PLANTOCK_SECONDS / Math.max(1, N)),
    ); // floor(1800/3) = 600
    const expectedMs = expectedIntervalSec * 1000; // 600 000

    expect(tickServiceMock.startPlanetUpdateTimer).toHaveBeenCalledWith(expectedMs);
  });
});
