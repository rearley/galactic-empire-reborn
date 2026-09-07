import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../game/player/roster-query';

/** Long enough that polling costs nothing; short enough to feel live. */
export const STATS_CACHE_MS = 15_000;

/** Canon's MAXLIST is 10 for `ros`; a web page has room for more. */
export const PUBLIC_ROSTER_LIMIT = 20;

export interface PublicRosterEntry {
  rank: number;
  username: string;
  /** String, not BigInt — BigInt throws inside JSON.stringify. */
  score: string;
  kills: number;
  planets: number;
}

export interface PublicStats {
  commanders: number;
  online: number;
  roster: PublicRosterEntry[];
}

@Injectable()
export class StatsService {
  private cached: { commanders: number; roster: PublicRosterEntry[] } | null = null;
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Counts and the public scoreboard.
   *
   * `commanders` and the roster answer different questions and legitimately use
   * different predicates. The roster is canon's board, which omits anyone who
   * has never scored (GECMDS.C:4038). `commanders` is "how many people signed
   * up", so it counts anyone who could log in — passwordHash not null, which is
   * also what keeps the 24 Cybertron rows out of the total.
   *
   * @see GECMDS.C:4038 — cmd_geroster's tmpusr.score > 0 filter, shared via
   * ROSTER_WHERE / ROSTER_ORDER_BY so the public board can never disagree with
   * the in-game one.
   */
  async getStats(): Promise<PublicStats> {
    const now = Date.now();
    if (this.cached === null || now - this.cachedAt >= STATS_CACHE_MS) {
      const [commanders, rows] = await Promise.all([
        this.prisma.user.count({ where: { passwordHash: { not: null } } }),
        this.prisma.user.findMany({
          where: ROSTER_WHERE,
          orderBy: ROSTER_ORDER_BY,
          take: PUBLIC_ROSTER_LIMIT,
          select: { userid: true, username: true, score: true, kills: true, planets: true },
        }),
      ]);

      this.cached = {
        commanders,
        roster: rows.map((row, i) => ({
          rank: i + 1,
          username: row.username ?? row.userid,
          score: row.score.toString(),
          kills: row.kills,
          planets: row.planets,
        })),
      };
      this.cachedAt = now;
    }

    // Read outside the cache branch on purpose: online-now is what makes the
    // page feel alive, and freezing it for 15 seconds is the one thing this
    // cache must not do.
    return { ...this.cached, online: this.presence.count() };
  }
}
