/**
 * Thin helper for the MidnightRun ledger table — one row per server-local calendar date.
 *
 * The PK (runDate) is a Postgres `date`, ensuring at most one row per calendar day.
 * Idempotency: a second call on the same day upserts (overwrites counters/completedAt).
 *
 * @see specs/009-midnight-job/data-model.md — MidnightRun model
 * @see specs/009-midnight-job/research.md D5 (date keying)
 */

import { PrismaClient } from '../../prisma/client';

export interface MidnightCounters {
  usersUpdated: number;
  planetsProcessed: number;
  mailReportsCreated: number;
  mailDeleted: number;
  teamsReconciled: number;
  teamsRemoved: number;
  abandonedSignupsDeleted: number;
}

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Returns true if a MidnightRun row exists for today's server-local date.
 * @see specs/009-midnight-job/research.md D5
 */
export async function hasRunForToday(tx: TxClient, today: Date): Promise<boolean> {
  const run = await tx.midnightRun.findUnique({ where: { runDate: today } });
  return run !== null;
}

/**
 * Upsert the MidnightRun ledger row for the given date.
 * Using upsert so the admin endpoint can re-run on the same day (FR-003).
 */
export async function recordRun(
  tx: TxClient,
  runDate: Date,
  completedAt: Date,
  durationMs: number,
  counters: MidnightCounters,
): Promise<void> {
  const data = {
    completedAt,
    durationMs,
    usersUpdated: counters.usersUpdated,
    planetsProcessed: counters.planetsProcessed,
    mailReportsCreated: counters.mailReportsCreated,
    mailDeleted: counters.mailDeleted,
    teamsReconciled: counters.teamsReconciled,
    teamsRemoved: counters.teamsRemoved,
  };

  await tx.midnightRun.upsert({
    where: { runDate },
    create: { runDate, ...data },
    update: data,
  });
}
