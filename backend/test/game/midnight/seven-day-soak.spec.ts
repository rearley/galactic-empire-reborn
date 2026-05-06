/**
 * T046 — 7-day soak: simulate 7 consecutive midnight passes against a fixture
 * with deleted users, orphan teamcodes, and planets with empty owner fields.
 * Asserts no unhandled exception across all 7 runs.
 *
 * SC-009: The midnight pass must be robust against messy real-world data.
 *
 * @see specs/009-midnight-job/tasks.md T046
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NUMITEMS } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

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
    providers: [MidnightService, MidnightRepository],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  await app.init();
  await truncateAll();

  // Seed messy fixture
  await prisma.user.createMany({
    data: [
      { userid: 'active1', username: 'active1', klscore: 1000n },
      { userid: 'active2', username: 'active2', teamcode: 5n, klscore: 500n },
      { userid: 'orphan1', username: 'orphan1', teamcode: 99n, klscore: 200n }, // orphan teamcode
    ],
  });

  await prisma.team.create({ data: { teamcode: 5n, teamname: 'Alpha' } });
  // Note: team 99 intentionally does NOT exist

  // Planets: one with valid owner, one with empty owner, one with deleted owner
  await prisma.planet.createMany({
    data: [
      {
        xsect: 1, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
        xcoord: 1, ycoord: 1, userid: 'active1', name: 'Planet1',
        enviorn: 0, resource: 0, cash: 100_000n, debt: 0n, tax: 0n,
        taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
        spyowner: '', technology: 0, teamcode: 0n,
        itemsQty: makeItemsQty(), itemsRate: Array(NUMITEMS).fill(0),
        itemsSell: Array(NUMITEMS).fill(0), itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0), itemsSold2a: Array(NUMITEMS).fill(0n),
      },
      {
        xsect: 2, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
        xcoord: 2, ycoord: 1, userid: null, name: 'Unowned',
        enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
        taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
        spyowner: '', technology: 0, teamcode: 0n,
        itemsQty: makeItemsQty(), itemsRate: Array(NUMITEMS).fill(0),
        itemsSell: Array(NUMITEMS).fill(0), itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0), itemsSold2a: Array(NUMITEMS).fill(0n),
      },
      {
        xsect: 3, ysect: 1, plnum: 1, type: PLTYPE_PLNT,
        xcoord: 3, ycoord: 1, userid: 'deleted_user', name: 'Ghost',
        enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
        taxrate: 0, warnings: 0, password: '', lastattack: '', beacon: '',
        spyowner: '', technology: 0, teamcode: 0n,
        itemsQty: makeItemsQty(), itemsRate: Array(NUMITEMS).fill(0),
        itemsSell: Array(NUMITEMS).fill(0), itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(0), itemsSold2a: Array(NUMITEMS).fill(0n),
      },
    ],
  });
}, 30_000);

afterAll(async () => {
  await truncateAll();
  await app.close();
});

describe('7-day soak (SC-009)', () => {
  it('completes 7 runs without unhandled exceptions', async () => {
    for (let day = 0; day < 7; day++) {
      // Delete today's ledger row so each run goes through (simulating successive days)
      await prisma.midnightRun.deleteMany();

      await expect(service.run()).resolves.not.toThrow();
    }
  }, 60_000);
});
