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
    providers: [MidnightService, MidnightRepository],
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

    // Seed today's row
    const today = new Date();
    const runDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
