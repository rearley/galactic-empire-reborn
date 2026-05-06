/**
 * T038 — Transaction rollback: fault inside phase 2 leaves no DB mutations.
 *
 * FR-012a: any unexpected error propagates and rolls the entire pass back.
 *
 * @see specs/009-midnight-job/tasks.md T038
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NUMITEMS, I_MEN } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;
let repo: MidnightRepository;

function makeItemsQty(): bigint[] {
  const qty = Array<bigint>(NUMITEMS).fill(0n);
  qty[I_MEN] = 0n;
  return qty;
}

async function truncateAll() {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.team.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.ship.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [PrismaModule, ScheduleModule.forRoot()],
    providers: [MidnightService, MidnightRepository],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  repo = app.get(MidnightRepository);
  await app.init();
});

afterAll(async () => {
  await truncateAll();
  await app.close();
});

beforeEach(async () => {
  await truncateAll();
});

describe('transaction rollback on fault (FR-012a)', () => {
  it('rolls back all mutations when processOwnedPlanets throws', async () => {
    await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 100n } });
    await prisma.planet.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        xsect: i + 1, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
        xcoord: i + 1, ycoord: 1, userid: 'alice', name: `Planet${i}`,
        enviorn: 0, resource: 0, cash: 100_000n, debt: 0n, tax: 0n,
        taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
        spyowner: '', technology: 0, teamcode: 0n,
        itemsQty: makeItemsQty(),
        itemsRate: Array(NUMITEMS).fill(0),
        itemsSell: Array(NUMITEMS).fill(0),
        itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0),
        itemsSold2a: Array(NUMITEMS).fill(0n),
      })),
    });

    // Inject a fault: processOwnedPlanets throws on the 3rd planet
    let planetCallCount = 0;
    const originalProcessOwnedPlanets = repo.processOwnedPlanets.bind(repo);
    jest.spyOn(repo, 'processOwnedPlanets').mockImplementation(async (tx) => {
      planetCallCount++;
      if (planetCallCount === 1) {
        throw new Error('Simulated phase-2 fault');
      }
      return originalProcessOwnedPlanets(tx);
    });

    await expect(service.run()).rejects.toThrow('Simulated phase-2 fault');

    // Assert no mutations remain
    const midnightRuns = await prisma.midnightRun.findMany();
    expect(midnightRuns).toHaveLength(0);

    const mailStats = await prisma.mailStat.findMany();
    expect(mailStats).toHaveLength(0);

    const alice = await prisma.user.findUniqueOrThrow({ where: { userid: 'alice' } });
    // Phase 1 should have reset, but since TX rolled back, score should be original
    expect(alice.plscore).toBe(0n);
    expect(alice.planets).toBe(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
