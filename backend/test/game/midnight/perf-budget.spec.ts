/**
 * T045 — Performance budget: 1,000 users + 2,000 planets < 5,000 ms.
 *
 * SC-005: the full midnight pass must complete in under 5 seconds against a
 * 1,000-user / 2,000-planet fixture on the dev Postgres container.
 *
 * Note: this test is marked with a 30s Jest timeout to give headroom on slow CI,
 * but the SC-005 assertion still requires the actual pass to be < 5,000 ms.
 *
 * @see specs/009-midnight-job/tasks.md T045
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NUMITEMS } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

const USER_COUNT = 1000;
const PLANET_COUNT = 2000;
const BUDGET_MS = 5000;

function makeItemsQty(): bigint[] {
  return Array<bigint>(NUMITEMS).fill(0n);
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
    providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  await app.init();
  await truncateAll();

  // Seed 1,000 users
  const users = Array.from({ length: USER_COUNT }, (_, i) => ({
    userid: `perfuser${i}`,
    username: `perfuser${i}`,
    klscore: BigInt(i * 100),
  }));
  await prisma.user.createMany({ data: users });

  // Seed 2,000 planets (2 per user on average)
  // 30 * 15 * 9 = 4050 unique (xsect, ysect, plnum) combos — enough for 2000
  const planets = Array.from({ length: PLANET_COUNT }, (_, i) => {
    const xsect = (i % 30) + 1;
    const ysect = (Math.floor(i / 30) % 15) + 1;
    const plnum = Math.floor(i / (30 * 15)) + 1;
    return { xsect, ysect, plnum };
  }).map(({ xsect, ysect, plnum }, i) => ({
    xsect, ysect, plnum,
    type: PLTYPE_PLNT,
    xcoord: xsect + 0.5,
    ycoord: ysect + 0.5,
    userid: `perfuser${i % USER_COUNT}`,
    name: `Planet${i}`,
    enviorn: 5, resource: 10,
    cash: BigInt(100_000 + i * 1000),
    debt: 0n, tax: BigInt(10_000 + i * 100),
    taxrate: 5, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    itemsQty: makeItemsQty(),
    itemsRate: Array<number>(NUMITEMS).fill(0),
    itemsSell: Array<number>(NUMITEMS).fill(0),
    itemsReserve: Array<number>(NUMITEMS).fill(0),
    itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
    itemsSold2a: Array<bigint>(NUMITEMS).fill(0n),
  }));

  // Insert in batches to avoid parameter limits
  const BATCH = 100;
  for (let i = 0; i < planets.length; i += BATCH) {
    await prisma.planet.createMany({ data: planets.slice(i, i + BATCH) });
  }

  // Seed neutral-zone planets required by refreshNeutralZone
  await seedNeutralZonePlanets(prisma);
}, 60_000);

afterAll(async () => {
  await truncateAll();
  await app.close();
});

describe('performance budget (SC-005)', () => {
  it(`completes in < ${BUDGET_MS}ms for ${USER_COUNT} users / ${PLANET_COUNT} planets`, async () => {
    const start = Date.now();
    const counters = await service.run();
    const elapsed = Date.now() - start;

    expect(counters.planetsProcessed).toBe(PLANET_COUNT);
    expect(counters.usersUpdated).toBe(USER_COUNT);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 30_000);
});
