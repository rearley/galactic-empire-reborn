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

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeMocks() {
  const emitMock = jest.fn();
  const mockEmitter = { emit: emitMock } as unknown as EventEmitter2;

  // Prisma mock: advisory lock succeeds, $transaction executes callback, unlock succeeds
  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
    $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      // Pass a no-op tx object; repo methods are mocked at the MidnightRepository level
      return cb({});
    }),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  } as unknown as PrismaService;

  // Repo mock — all phases succeed with minimal counters
  const mockRepo = {
    refreshNeutralZone: jest.fn().mockResolvedValue(undefined),
    resetUserAccumulators: jest.fn().mockResolvedValue(0),
    processOwnedPlanets: jest.fn().mockResolvedValue({ planetsProcessed: 0, mailReportsCreated: 0 }),
    purgeMail: jest.fn().mockResolvedValue(0),
    zeroAllTeams: jest.fn().mockResolvedValue(undefined),
    countTeamMembersAndResetOrphans: jest.fn().mockResolvedValue(undefined),
    setUserScores: jest.fn().mockResolvedValue(undefined),
    applyPerMemberTeamScore: jest.fn().mockResolvedValue(undefined),
    markEmptyTeamsRemoved: jest.fn().mockResolvedValue({ teamsReconciled: 0, teamsRemoved: 0 }),
    assignRosterPositions: jest.fn().mockResolvedValue(undefined),
  } as unknown as MidnightRepository;

  // Simulate recordRun — midnight-run.ledger function is called inside the transaction callback
  // We mock the $transaction to run the callback with a fake tx that has midnightRun.create
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        midnightRun: {
          create: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
        $queryRaw: jest.fn().mockResolvedValue([]),
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
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ pg_try_advisory_lock: false }]);

    const svc = new MidnightService(mockPrisma, mockRepo, mockEmitter);
    const { MidnightLockHeldError } = await import('../../../src/game/midnight/midnight.service');
    await expect(svc.run()).rejects.toThrow(MidnightLockHeldError);

    expect(emitMock).not.toHaveBeenCalled();
  });
});
