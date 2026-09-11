/**
 * T-P016b — MidnightService emits MIDNIGHT_COMPLETED after a successful run.
 *
 * Validates that the event constant is defined and that midnight.service.ts emits
 * it via EventEmitter2 only after a successful transaction commit (not on failure
 * or lock-contention).
 *
 * Unit-level: Prisma and MidnightRepository are mocked; no DB required.
 *
 * @see src/game/midnight/midnight.service.ts run()
 * @see src/game/midnight/midnight-events.ts MIDNIGHT_COMPLETED
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { MidnightService } from '../../../src/game/midnight/midnight.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MIDNIGHT_COMPLETED } from '../../../src/game/midnight/midnight-events';
import type { Mock } from 'vitest';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeMocks() {
  const emitMock = vi.fn();
  const mockEmitter = { emit: emitMock } as unknown as EventEmitter2;

  // Prisma mock: advisory lock succeeds, $transaction executes callback, unlock succeeds
  const mockPrisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_try_advisory_xact_lock: true }]),
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      // Pass a no-op tx object; repo methods are mocked at the MidnightRepository level
      return cb({});
    }),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
  } as unknown as PrismaService;

  // Repo mock — all phases succeed with minimal counters
  const mockRepo = {
    refreshNeutralZone: vi.fn().mockResolvedValue(undefined),
    resetUserAccumulators: vi.fn().mockResolvedValue(0),
    processOwnedPlanets: vi.fn().mockResolvedValue({ planetsProcessed: 0, mailReportsCreated: 0 }),
    purgeMail: vi.fn().mockResolvedValue(0),
    zeroAllTeams: vi.fn().mockResolvedValue(undefined),
    countTeamMembersAndResetOrphans: vi.fn().mockResolvedValue(undefined),
    setUserScores: vi.fn().mockResolvedValue(undefined),
    applyPerMemberTeamScore: vi.fn().mockResolvedValue(undefined),
    markEmptyTeamsRemoved: vi.fn().mockResolvedValue({ teamsReconciled: 0, teamsRemoved: 0 }),
    assignRosterPositions: vi.fn().mockResolvedValue(undefined),
    purgeAbandonedSignups: vi.fn().mockResolvedValue(0),
  } as unknown as MidnightRepository;

  // Simulate recordRun — midnight-run.ledger function is called inside the transaction callback
  // We mock the $transaction to run the callback with a fake tx that has midnightRun.create
  (mockPrisma.$transaction as Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        midnightRun: {
          create: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        // The advisory lock is now taken as the transaction's FIRST statement
        // (pg_try_advisory_xact_lock) so a connection pool cannot lose it, so
        // the fake tx has to grant it. @see midnight.service.ts run()
        $queryRaw: vi.fn().mockResolvedValue([{ pg_try_advisory_xact_lock: true }]),
      };
      return cb(fakeTx);
    },
  );

  return { mockEmitter, emitMock, mockPrisma, mockRepo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T-P016b — MidnightService emits MIDNIGHT_COMPLETED after successful run', () => {
  it('MIDNIGHT_COMPLETED constant is defined and is a non-empty string', () => {
    expect(MIDNIGHT_COMPLETED).toBeDefined();
    expect(typeof MIDNIGHT_COMPLETED).toBe('string');
    expect(MIDNIGHT_COMPLETED.length).toBeGreaterThan(0);
  });

  it('emits MIDNIGHT_COMPLETED via EventEmitter2 after a successful run()', async () => {
    const { mockEmitter, emitMock, mockPrisma, mockRepo } = makeMocks();

    const svc = new MidnightService(mockPrisma, mockRepo, mockEmitter);
    await svc.run();

    expect(emitMock).toHaveBeenCalledWith(MIDNIGHT_COMPLETED, expect.anything());
  });

  it('does NOT emit MIDNIGHT_COMPLETED when advisory lock is held (failed run)', async () => {
    const { mockEmitter, emitMock, mockPrisma, mockRepo } = makeMocks();

    // Override: advisory lock fails
    // Refuse the lock inside the transaction — that is where it is taken now.
    (mockPrisma.$transaction as Mock).mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          midnightRun: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
          $executeRaw: vi.fn(),
          $queryRaw: vi.fn().mockResolvedValue([{ pg_try_advisory_xact_lock: false }]),
        }),
    );

    const svc = new MidnightService(mockPrisma, mockRepo, mockEmitter);
    const { MidnightLockHeldError } = await import('../../../src/game/midnight/midnight.service');
    await expect(svc.run()).rejects.toThrow(MidnightLockHeldError);

    expect(emitMock).not.toHaveBeenCalled();
  });
});
