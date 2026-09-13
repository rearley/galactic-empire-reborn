/**
 * The midnight advisory lock must not outlive the run.
 *
 * `pg_try_advisory_lock` is a SESSION-level lock, and Prisma hands out a
 * pooled connection per query: the lock was taken on one connection and the
 * `finally` unlock ran on whichever connection the pool happened to return, so
 * `pg_advisory_unlock` reported false on a session that never held it and the
 * lock stayed held on the original connection.
 *
 * The effect is that midnight succeeds exactly ONCE per backend process. Every
 * later attempt — including the nightly cron — is rejected with
 * MIDNIGHT_LOCK_HELD until the process restarts, so scoring silently stops
 * after the first night. It is the same failure shape as the teamcode
 * primary-key collision: a job that quietly never runs again.
 *
 * `pg_advisory_xact_lock` is scoped to the transaction and released by
 * Postgres on commit or rollback, which is correct under a pool. Duplicate
 * same-day runs are prevented by the MidnightRun ledger, not by the lock.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ADVISORY_LOCK_KEY } from '../../../src/game/midnight/midnight.constants';
import { seedNeutralZonePlanets } from './neutral-zone.fixture';

let app: TestingModule;
let prisma: PrismaService;
let service: MidnightService;

async function lockHolders(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM pg_locks
    WHERE locktype = 'advisory' AND objid = ${ADVISORY_LOCK_KEY}::bigint % 4294967296
  `;
  return Number(rows[0]?.n ?? 0n);
}

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [PrismaModule, ScheduleModule.forRoot()],
    providers: [
      MidnightService,
      MidnightRepository,
      { provide: EventEmitter2, useValue: { emit: vi.fn(), on: vi.fn() } },
    ],
  }).compile();
  prisma = app.get(PrismaService);
  service = app.get(MidnightService);
  await app.init();
});

afterAll(async () => {
  await prisma.midnightRun.deleteMany();
  await app.close();
});

describe('midnight releases its advisory lock', () => {
  it('holds no advisory lock once the run has finished', async () => {
    await prisma.midnightRun.deleteMany();
    await seedNeutralZonePlanets(prisma);

    // Grow the pool past one connection first: the leak only shows when the
    // acquire and the release land on different sessions, which a cold
    // single-connection pool hides.
    await Promise.all(Array.from({ length: 8 }, () => prisma.$queryRaw`SELECT pg_sleep(0.05)::text`));

    await service.run();

    expect(await lockHolders()).toBe(0);
  });

  it('can run again in the same process', async () => {
    await prisma.midnightRun.deleteMany();
    await seedNeutralZonePlanets(prisma);
    await service.run();

    await prisma.midnightRun.deleteMany();
    // The second call must not be rejected by a leaked lock.
    await expect(service.run()).resolves.toBeDefined();
  });
});
