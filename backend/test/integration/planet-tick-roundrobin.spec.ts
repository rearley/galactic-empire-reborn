/**
 * T044 — PlanetTickService sweeps owned planets on the PLANET_UPDATE firing.
 *
 * Each planet is updated once per PLANTOCK (GEMAIN.C:469, 30 minutes), not on
 * every firing: C walks the planet file with a cursor, doing up to MAXTIC
 * records per kick and pacing the kicks so a full pass takes `plantock`
 * (GEMAIN.C:656). Ticking the whole set every PLANTIME made the economy ~33x
 * too fast.
 */

import { PlanetTickService } from '../../src/game/planet/planet-tick.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { planetKey } from '../../src/game/planet/planet-state.types';
import { PLANTIME } from '../../src/game/constants';

function buildMocks(
  fakePlanets: Array<{ xsect: number; ysect: number; plnum: number; userid?: string | null }>,
) {
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
  // Owned AND populated: the sweep skips zero-population worlds outright
  // (GEMAIN.C:2130), so slot 0 (I_MEN) has to be non-zero here.
  const populated = () => Array.from({ length: 14 }, () => ({ qty: 1000n }));
  // A FACTORY, not a shared array. The sweep now stamps `lastTickAt` on the
  // planet object itself — a persisted schedule rather than a Map inside the
  // service — so one test's sweep would otherwise leave the next test's planets
  // already up to date. @see planet-tick.service isDue
  const makePlanets = () => [
    { xsect: 1, ysect: 0, plnum: 1, userid: 'owner', items: populated() },
    { xsect: 1, ysect: 0, plnum: 2, userid: 'owner', items: populated() },
    { xsect: 2, ysect: 1, plnum: 1, userid: 'owner', items: populated() },
  ];

  it('ticks every owned planet exactly once per firing (N=3)', async () => {
    const fakePlanets = makePlanets();
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

  it('a second firing in the same period does no work', async () => {
    const fakePlanets = makePlanets();
    const { planetServiceMock, tickServiceMock, tickedKeys, getHandler } =
      buildMocks(fakePlanets);

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const handler = getHandler()!;
    const N = fakePlanets.length;

    await handler();
    await handler(); // no time has passed — nothing is due again

    expect(tickedKeys).toHaveLength(N);
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
    const { planetServiceMock, tickServiceMock } = buildMocks(makePlanets());

    const svc = new PlanetTickService(planetServiceMock, tickServiceMock);
    await svc.onModuleInit();

    const expectedMs = PLANTIME * 1000; // 55 000

    expect(tickServiceMock.startPlanetUpdateTimer).toHaveBeenCalledWith(expectedMs);
  });
});
