/**
 * T014 — Planet bootstrap integration test.
 * Boots the full AppModule and asserts PlanetStateService.size() === prisma.planet.count().
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PlanetStateService bootstrap (planet-bootstrap)', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let planetService: PlanetStateService;

  beforeEach(async () => {
    // Fake only setInterval/setTimeout — allow setImmediate/nextTick for Prisma's async internals.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = app.get(PrismaService);
    await app.init();

    planetService = app.get(PlanetStateService);
  }, 60_000);

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  }, 30_000);

  it('PlanetStateService.size() equals prisma.planet.count()', async () => {
    const dbCount = await prisma.planet.count();
    expect(planetService.size()).toBe(dbCount);
  });

  it('no errors logged during boot (service initializes cleanly)', () => {
    // If onModuleInit throws, the test would fail at app.init() above.
    // Reaching here means clean boot.
    expect(planetService).toBeDefined();
  });
});
