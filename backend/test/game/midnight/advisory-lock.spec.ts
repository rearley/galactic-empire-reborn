/**
 * T037 — Advisory lock concurrency: second invocation is cleanly rejected.
 *
 * @see specs/009-midnight-job/tasks.md T037
 * @see specs/009-midnight-job/research.md D2 (advisory lock)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { MidnightService, MidnightLockHeldError } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

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
});

afterAll(async () => {
  await truncateAll();
  await app.close();
});

beforeEach(async () => {
  await truncateAll();
  await seedNeutralZonePlanets(prisma);
});

describe('advisory lock concurrency (FR-004a)', () => {
  it('first caller completes successfully', async () => {
    await expect(service.run()).resolves.toBeDefined();
  });

  it('concurrent second call throws MidnightLockHeldError', async () => {
    // Simulate the advisory lock being held by another session by mocking
    // pg_try_advisory_lock to return false. Using a real second DB connection
    // is unreliable because Prisma may reuse the same session from its pool.
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw').mockResolvedValueOnce(
      [{ pg_try_advisory_lock: false }],
    );

    try {
      await expect(service.run()).rejects.toThrow(MidnightLockHeldError);
    } finally {
      queryRawSpy.mockRestore();
    }
  });

  it('scheduledRun() catches MidnightLockHeldError and does not rethrow', async () => {
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw').mockResolvedValueOnce(
      [{ pg_try_advisory_lock: false }],
    );

    try {
      // scheduledRun catches MidnightLockHeldError — should resolve, not throw
      await expect(service.scheduledRun()).resolves.toBeUndefined();
    } finally {
      queryRawSpy.mockRestore();
    }
  });
});
