import type { Prisma } from '../../prisma/client';

/**
 * Canon's roster selection, shared by the in-game `ros` command and the public
 * stats page so the two can never disagree.
 *
 * Extracted verbatim from ros.handler.ts. The public board is not a second
 * leaderboard with its own taste — it is the same board, rendered in HTML.
 *
 * @see GECMDS.C:4020-4045 — cmd_geroster
 * @see GECMDS.C:4038 — tmpusr.score > 0
 */
export const ROSTER_WHERE = {
  score: { gt: 0n },
  AND: [
    { NOT: { userid: { startsWith: 'Cybrg-' } } },
    { NOT: { userid: { startsWith: '@Droid-' } } },
    { NOT: { userid: { startsWith: '@' } } },
  ],
} satisfies Prisma.UserWhereInput;

/** Score descending; kills then userid break ties so paging is stable. */
export const ROSTER_ORDER_BY = [
  { score: 'desc' },
  { kills: 'desc' },
  { userid: 'asc' },
] satisfies Prisma.UserOrderByWithRelationInput[];

/** Columns both the `ros` command and the public board render. */
export interface RosterRow {
  userid: string;
  username: string | null;
  score: bigint;
  kills: number;
  planets: number;
  population: bigint;
}
