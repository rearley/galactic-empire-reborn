/**
 * T024 — US3: Mail purge integration test.
 *
 * Asserts mail older than MAILDAYS and mail to *-prefixed recipients is deleted.
 * Configurable retention window verified by overriding MIDNIGHT_MAILDAYS.
 *
 * The purge used to target the `Mail` table, which nothing in the game writes
 * to — every real message (production reports, attack notices, economy notices)
 * goes to `MailStat`, and the inbox reads only `MailStat`. So mail never
 * expired: ten planets produced 3,650 undeletable rows a year. C has one mail
 * file, `gebb4`, and `mailit()` writes everything into it including the
 * MAILSTAT production records (GEMAIN.C:1160-1161), so the single purge covers
 * the lot.
 *
 * @see GEMAIN.C:1175-1195 — phase-3 mail purge
 * @see specs/009-midnight-job/tasks.md T024
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NUMITEMS } from '../../../src/game/constants/items';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

async function truncateAll() {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
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
});

afterAll(async () => {
  await truncateAll();
  await app.close();
});

beforeEach(async () => {
  await truncateAll();
  await seedNeutralZonePlanets(prisma);
  // Create a user to satisfy Mail FK
  await prisma.user.create({ data: { userid: 'alice', username: 'alice', klscore: 0n } });
});

function daysAgoStamp(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 86_400;
}

function mailRow(ageInDays: number, recipient = 'alice', classNum = 1, msgnoOffset = 0) {
  return {
    userid: recipient,
    class: classNum,
    msgno: BigInt(Date.now()) + BigInt(msgnoOffset),
    stamp: daysAgoStamp(ageInDays),
    type: 0, dtime: '', topic: '', name1: '',
    int1: 0, int2: 0, cash: 0n, debt: 0n, tax: 0n,
    itemqty: Array.from({ length: NUMITEMS }, () => 0n),
  };
}

describe('US3 — mail purge (T024)', () => {
  it('deletes mail older than 7 days (default MAILDAYS)', async () => {
    await prisma.mailStat.createMany({
      data: [
        mailRow(8, 'alice', 1, 0),   // 8 days old — should be deleted
        mailRow(10, 'alice', 1, 1),  // 10 days old — should be deleted
        mailRow(6, 'alice', 1, 2),   // 6 days old — should be kept
        mailRow(1, 'alice', 1, 3),   // 1 day old — should be kept
      ],
    });

    await service.run();

    const remaining = await prisma.mailStat.findMany({ where: { userid: 'alice' } });
    expect(remaining).toHaveLength(2);
    expect(remaining.every((m) => m.stamp >= daysAgoStamp(7))).toBe(true);
  });

  it('preserves mail exactly at the 7-day boundary', async () => {
    // Exactly 7 days old — stamp = now - 7*86400. Should be deleted (< threshold means strictly less).
    // Actually: threshold = now - maildays * 86400. Mail with stamp < threshold is deleted.
    // 7 days old stamp = now - 7*86400 = threshold → NOT deleted (not strictly less).
    const exactlySevenDays = daysAgoStamp(7);
    await prisma.mailStat.create({
      data: { ...mailRow(0, 'alice', 1, 10), stamp: exactlySevenDays },
    });

    await service.run();

    const remaining = await prisma.mailStat.findMany({ where: { userid: 'alice' } });
    expect(remaining).toHaveLength(1);
  });

  it('deletes mail to *-prefixed recipients regardless of age', async () => {
    // Need a *ghost user — but FK requires user. Use alice but with * prefix... no, FK.
    // The *-prefix deletion uses userid LIKE '*%', but Mail has a FK to User.
    // We need a User with * prefix.
    await prisma.user.create({ data: { userid: '*ghost', username: '*ghost' } });
    await prisma.mailStat.create({
      data: mailRow(1, '*ghost', 1, 20), // 1 day old but *-prefixed recipient
    });
    await prisma.mailStat.create({
      data: mailRow(1, 'alice', 1, 21), // 1 day old alice — should be kept
    });

    await service.run();

    const ghostMail = await prisma.mailStat.findMany({ where: { userid: '*ghost' } });
    expect(ghostMail).toHaveLength(0);

    const aliceMail = await prisma.mailStat.findMany({ where: { userid: 'alice' } });
    expect(aliceMail).toHaveLength(1);
  });

  it('preserves mail within retention window', async () => {
    await prisma.mailStat.createMany({
      data: [
        mailRow(1, 'alice', 1, 30),
        mailRow(3, 'alice', 1, 31),
        mailRow(6, 'alice', 1, 32),
      ],
    });

    await service.run();

    const remaining = await prisma.mailStat.findMany();
    expect(remaining).toHaveLength(3);
  });

  it('configurable retention: MIDNIGHT_MAILDAYS=14 keeps 8–13-day-old mail', async () => {
    const originalMaildays = process.env['MIDNIGHT_MAILDAYS'];
    process.env['MIDNIGHT_MAILDAYS'] = '14';

    // Rebuild service with new env
    const testApp = await Test.createTestingModule({
      imports: [PrismaModule, ScheduleModule.forRoot()],
      providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
    }).compile();
    const testPrisma = testApp.get(PrismaService);
    const testService = testApp.get(MidnightService);
    await testApp.init();

    try {
      await testPrisma.mailStat.createMany({
        data: [
          mailRow(15, 'alice', 1, 40), // 15 days — deleted
          mailRow(13, 'alice', 1, 41), // 13 days — kept (< 14)
          mailRow(8, 'alice', 1, 42),  // 8 days — kept
          mailRow(1, 'alice', 1, 43),  // 1 day — kept
        ],
      });

      await testService.run();

      const remaining = await testPrisma.mailStat.findMany({ where: { userid: 'alice' } });
      expect(remaining).toHaveLength(3);
    } finally {
      if (originalMaildays === undefined) {
        delete process.env['MIDNIGHT_MAILDAYS'];
      } else {
        process.env['MIDNIGHT_MAILDAYS'] = originalMaildays;
      }
      await testPrisma.midnightRun.deleteMany();
      await testApp.close();
    }
  });
});
