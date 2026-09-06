/**
 * T039 — Self-heal on startup: MidnightService.onApplicationBootstrap().
 *
 * Boot with no MidnightRun for today → run() is called.
 * Boot with today's row → run() is NOT called.
 *
 * @see specs/009-midnight-job/tasks.md T039
 * @see specs/009-midnight-job/research.md D4 (self-heal)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { runDateValue } from '../../../src/game/midnight/midnight-time';

async function truncateAll(prisma: PrismaService) {
  await prisma.midnightRun.deleteMany();
  await prisma.mailStat.deleteMany();
  await prisma.mail.deleteMany();
  await prisma.team.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.ship.deleteMany();
  await prisma.user.deleteMany();
}

async function makeApp() {
  const app = await Test.createTestingModule({
    imports: [PrismaModule, ScheduleModule.forRoot()],
    providers: [MidnightService, MidnightRepository, { provide: EventEmitter2, useValue: { emit: jest.fn(), on: jest.fn() } }],
  }).compile();
  const prisma = app.get(PrismaService);
  const service = app.get(MidnightService);
  return { app, prisma, service };
}

describe('self-heal on startup (FR-001b)', () => {
  it('calls run() when no MidnightRun row exists for today', async () => {
    const { app, prisma, service } = await makeApp();
    await truncateAll(prisma);

    const runSpy = jest.spyOn(service, 'run').mockResolvedValue({
      usersUpdated: 0, planetsProcessed: 0, mailReportsCreated: 0,
      mailDeleted: 0, teamsReconciled: 0, teamsRemoved: 0,
    });

    await app.init(); // triggers onApplicationBootstrap

    // run() is called asynchronously in onApplicationBootstrap
    await new Promise((r) => setTimeout(r, 100));

    expect(runSpy).toHaveBeenCalledTimes(1);

    await truncateAll(prisma);
    await app.close();
  });

  it('does NOT call run() when today\'s MidnightRun row already exists', async () => {
    const { app, prisma, service } = await makeApp();
    await truncateAll(prisma);

    // Seed today's row — dated the way PRODUCTION dates it.
    //
    // This used to hand-compute `new Date(y, m, d)` from HOST-local time, but
    // MidnightService dates every run in GAME_TIMEZONE (America/New_York by
    // default) via runDateValue. The two agree for most of the day and diverge
    // either side of the boundary: at 01:25 UTC the host says 2026-09-06 while
    // the game day is still 2026-09-05, so the seeded row did not match the key
    // the service looks up, self-heal saw no row, and it ran. The test failed
    // nightly in the 00:00-04:00 UTC window and passed the rest of the time.
    //
    // midnight-time.ts's own docblock warns about exactly this mismatch. Using
    // the production function means the test cannot drift from it again.
    const runDate = runDateValue(new Date());
    await prisma.midnightRun.create({
      data: {
        runDate,
        completedAt: new Date(),
        durationMs: 100,
        usersUpdated: 0, planetsProcessed: 0, mailReportsCreated: 0,
        mailDeleted: 0, teamsReconciled: 0, teamsRemoved: 0,
      },
    });

    const runSpy = jest.spyOn(service, 'run');

    await app.init();
    await new Promise((r) => setTimeout(r, 100));

    expect(runSpy).not.toHaveBeenCalled();

    await truncateAll(prisma);
    await app.close();
  });
});
