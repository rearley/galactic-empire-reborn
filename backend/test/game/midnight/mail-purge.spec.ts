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
import { MAILDAYS_DEFAULT } from '../../../src/game/midnight/midnight.constants';

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
    providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: vi.fn(), on: vi.fn() } }],
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

/**
 * A stamp `days` old, nudged one minute INSIDE the window.
 *
 * purgeMail deletes `stamp < now - mailDays*86400` and computes its own
 * `now` — later than this one by however long the fixture insert and the
 * service call take. A row placed exactly ON the boundary therefore sat on the
 * losing side of a strict comparison whenever the wall clock advanced a single
 * second between the two, which made "preserves mail within retention window"
 * fail at random. The minute keeps the boundary case meaningful (it is still
 * the oldest mail that must survive) without racing the clock.
 */
function daysAgoStamp(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 86_400 + 60;
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
  // Ages are expressed relative to MAILDAYS_DEFAULT rather than the literal it
  // used to hold. Canon MAILDAYS is 3 (MBMGEMSG.MSG); this file hard-coded 7,
  // which was the port's own figure, so the fixtures silently encoded a second
  // declaration of the retention window.
  const KEEP = MAILDAYS_DEFAULT;

  it('deletes mail older than the retention window', async () => {
    await prisma.mailStat.createMany({
      data: [
        mailRow(KEEP + 1, 'alice', 1, 0),  // past the window — deleted
        mailRow(KEEP + 3, 'alice', 1, 1),  // well past — deleted
        mailRow(KEEP - 1, 'alice', 1, 2),  // inside — kept
        mailRow(0, 'alice', 1, 3),         // today — kept
      ],
    });

    await service.run();

    const remaining = await prisma.mailStat.findMany({ where: { userid: 'alice' } });
    expect(remaining).toHaveLength(2);
    expect(remaining.every((m) => m.stamp >= daysAgoStamp(KEEP))).toBe(true);
  });

  it('preserves mail exactly at the boundary', async () => {
    // threshold = now - maildays*86400, and deletion is strictly less than it,
    // so mail landing exactly on the boundary survives.
    await prisma.mailStat.create({
      data: { ...mailRow(0, 'alice', 1, 10), stamp: daysAgoStamp(KEEP) },
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
    // All inside the window, expressed relative to it: 6 days old is outside a
    // canon 3-day retention and only survived while this file assumed 7.
    await prisma.mailStat.createMany({
      data: [
        mailRow(0, 'alice', 1, 30),
        mailRow(KEEP - 1, 'alice', 1, 31),
        mailRow(KEEP, 'alice', 1, 32),
      ],
    });

    await service.run();

    const remaining = await prisma.mailStat.findMany();
    expect(remaining).toHaveLength(3);
  });

  // MAILDAYS is `numopt(MAILDAYS,1,7)` (GEMAIN.C:497) and the option declares
  // its own bounds, `N 1 7` (GE/REL/MBMGEMSG.MSG:449). This test used to set 14
  // and assert 8- and 13-day-old mail survived — it was pinning a retention
  // window the original refuses. 14 clamps to 7.
  it('configurable retention: MIDNIGHT_MAILDAYS=14 clamps to canon max 7', async () => {
    const originalMaildays = process.env['MIDNIGHT_MAILDAYS'];
    process.env['MIDNIGHT_MAILDAYS'] = '14';

    // Rebuild service with new env
    const testApp = await Test.createTestingModule({
      imports: [PrismaModule, ScheduleModule.forRoot()],
      providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: vi.fn(), on: vi.fn() } }],
    }).compile();
    const testPrisma = testApp.get(PrismaService);
    const testService = testApp.get(MidnightService);
    await testApp.init();

    try {
      await testPrisma.mailStat.createMany({
        data: [
          mailRow(15, 'alice', 1, 40), // 15 days — deleted
          mailRow(13, 'alice', 1, 41), // 13 days — deleted (14 clamps to 7)
          mailRow(8, 'alice', 1, 42),  // 8 days  — deleted
          mailRow(6, 'alice', 1, 43),  // 6 days  — kept (< 7)
          mailRow(1, 'alice', 1, 44),  // 1 day   — kept
        ],
      });

      await testService.run();

      const remaining = await testPrisma.mailStat.findMany({ where: { userid: 'alice' } });
      expect(remaining).toHaveLength(2);
      expect(remaining.every((m) => m.stamp >= daysAgoStamp(7))).toBe(true);
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
