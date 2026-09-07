/**
 * Nightly maintenance service — faithful port of GEMAIN.C:gemidnighta (1084-1335).
 *
 * Entry points:
 *   - scheduledRun() — @Cron('0 0 * * *') — daily at server-local midnight
 *   - OnApplicationBootstrap.onApplicationBootstrap() — self-heal on startup
 *   - run() — public; called by all paths and by the admin HTTP endpoint
 *
 * All four phases execute inside a single Prisma $transaction gated by a
 * TRANSACTION-scoped Postgres advisory lock, taken as the transaction's first
 * statement. Concurrent invocations are rejected immediately, and Postgres
 * releases the lock on commit or rollback — a session-scoped lock cannot be
 * released reliably from a connection pool.
 *
 * @see GEMAIN.C:gemidnighta (1084-1335)
 * @see specs/009-midnight-job/plan.md
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MidnightRepository } from './midnight.repository';
import { MidnightCounters, hasRunForToday, recordRun } from './midnight-run.ledger';
import { ADVISORY_LOCK_KEY, ABANDONED_SIGNUP_DAYS } from './midnight.constants';
import { loadMidnightConfig } from './midnight.config';
import { MIDNIGHT_COMPLETED, MidnightCompletedPayload } from './midnight-events';
import { GAME_TIMEZONE, runDateValue } from './midnight-time';

export const MIDNIGHT_LOCK_HELD = 'MIDNIGHT_LOCK_HELD' as const;

export class MidnightLockHeldError extends Error {
  readonly code = MIDNIGHT_LOCK_HELD;
  constructor() { super('Midnight advisory lock is held by another invocation'); }
}

/**
 * The game's current calendar date, as the Postgres `date` column stores it.
 * Measured in {@link GAME_TIMEZONE}, not the host's zone — see midnight-time.ts
 * for why the cron and this must read the same clock.
 */
function todayLocal(): Date {
  return runDateValue(new Date());
}

@Injectable()
export class MidnightService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MidnightService.name);
  private readonly config = loadMidnightConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: MidnightRepository,
    private readonly events: EventEmitter2,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const today = todayLocal();
    const alreadyRan = await this.prisma.midnightRun.findUnique({ where: { runDate: today } });
    if (alreadyRan) {
      this.logger.log('midnight self-heal: today already ran — skipping');
      return;
    }
    this.logger.log('midnight self-heal: no run found for today — executing');
    try {
      const counters = await this.run();
      this.logger.log(`midnight self-heal: complete — ${JSON.stringify(counters)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`midnight self-heal: failed — ${msg}`);
    }
  }

  /**
   * Calendar-cadence cron — fires at 00:00 in {@link GAME_TIMEZONE} every day.
   *
   * The zone is passed explicitly rather than left to the host's TZ so the
   * schedule survives redeployment onto a machine set to anything else.
   * @see GEMAIN.C:gemidnighta — the original game's midnight pass
   */
  @Cron('0 0 * * *', { timeZone: GAME_TIMEZONE })
  async scheduledRun(): Promise<void> {
    this.logger.log('midnight cron: starting scheduled run');
    try {
      const counters = await this.run();
      this.logger.log(`midnight cron: complete — ${JSON.stringify(counters)}`);
    } catch (err: unknown) {
      if (err instanceof MidnightLockHeldError) {
        this.logger.warn('midnight cron: advisory lock held — another process is already running');
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`midnight cron: failed — ${msg}`);
    }
  }

  /**
   * Execute the full four-phase midnight maintenance pass.
   * Gated by a Postgres advisory lock; runs inside a single transaction.
   *
   * Throws MidnightLockHeldError if the lock cannot be acquired.
   *
   * @see GEMAIN.C:gemidnighta (1084-1335)
   */
  async run(): Promise<MidnightCounters> {
    const startMs = Date.now();
    const today = todayLocal();

    {
      const counters = await this.prisma.$transaction(async (tx) => {
        // Transaction-scoped advisory lock, taken as the first statement so it
        // lives on the connection this transaction has pinned.
        //
        // The session-level `pg_try_advisory_lock` this replaced was acquired
        // on one pooled connection and released on whichever the pool handed
        // back, so `pg_advisory_unlock` returned false against a session that
        // never held it and the lock leaked. Midnight then succeeded exactly
        // once per backend process and every later run — the nightly cron
        // included — was rejected with MIDNIGHT_LOCK_HELD until restart.
        // Postgres releases an xact lock on commit or rollback, so a pool
        // cannot lose track of it. Duplicate same-day runs are prevented by
        // the MidnightRun ledger, not by this lock.
        const lockResult = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}::bigint)
        `;
        if (!(lockResult[0]?.pg_try_advisory_xact_lock ?? false)) {
          throw new MidnightLockHeldError();
        }

        this.logger.log('midnight: phase 0 — refresh neutral zone planets');
        await this.repo.refreshNeutralZone(tx);

        this.logger.log('midnight: phase 1 — reset user accumulators');
        const usersUpdated = await this.repo.resetUserAccumulators(tx);

        this.logger.log('midnight: phase 2 — process owned planets');
        const { planetsProcessed, mailReportsCreated } = await this.repo.processOwnedPlanets(tx, today);

        this.logger.log('midnight: phase 3 — purge mail');
        const mailDeleted = await this.repo.purgeMail(tx, this.config.mailDays);

        this.logger.log('midnight: phase 4 — team reconciliation and scoring');
        await this.repo.zeroAllTeams(tx);
        await this.repo.countTeamMembersAndResetOrphans(tx);
        await this.repo.setUserScores(tx);
        await this.repo.applyPerMemberTeamScore(tx);
        const { teamsReconciled, teamsRemoved } = await this.repo.markEmptyTeamsRemoved(tx);
        await this.repo.assignRosterPositions(tx);

        this.logger.log('midnight: phase 5 — purge abandoned signups');
        const abandonedSignupsDeleted = await this.repo.purgeAbandonedSignups(
          tx, ABANDONED_SIGNUP_DAYS, new Date(),
        );

        const completedAt = new Date();
        const durationMs = Date.now() - startMs;

        const phaseCounters: MidnightCounters = {
          usersUpdated,
          planetsProcessed,
          mailReportsCreated,
          mailDeleted,
          teamsReconciled,
          teamsRemoved,
          abandonedSignupsDeleted,
        };

        await recordRun(tx, today, completedAt, durationMs, phaseCounters);

        return phaseCounters;
      }, { timeout: 30_000 });

      const durationMs = Date.now() - startMs;
      this.logger.log(JSON.stringify({
        event: 'midnight.complete',
        date: today.toISOString().slice(0, 10),
        ms: durationMs,
        ...counters,
      }));

      // Notify in-memory services (e.g. ShipStateService) that the midnight pass
      // completed successfully so they can refresh DB-backed cached state.
      // Only emitted after transaction commit + recordRun — never on lock failure.
      const payload: MidnightCompletedPayload = {
        runDate: today.toISOString().slice(0, 10),
        durationMs,
      };
      this.events.emit(MIDNIGHT_COMPLETED, payload);

      return counters;
    }
  }
}
