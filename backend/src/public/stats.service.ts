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

type CachedShape = { commanders: number; roster: PublicRosterEntry[] };

@Injectable()
export class StatsService {
  private cached: CachedShape | null = null;
  private cachedAt = 0;

  // The in-flight PROMISE, not the resolved value. Assigning `this.cached`
  // only after its `await` left a window, on every cold (or just-expired)
  // request, where N concurrent callers each saw `cached === null` and each
  // ran both queries — for a public, unauthenticated, polled endpoint, that
  // made the 15-second cache irrelevant to concurrent load. Caching the
  // promise means every caller who arrives before it settles shares the one
  // in-flight query instead of starting their own.
  private pending: Promise<CachedShape> | null = null;

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
      if (this.pending === null) {
        this.pending = this.fetchAndCache(now).finally(() => {
          this.pending = null;
        });
      }
      // Every caller who arrives while a query is in flight awaits the same
      // promise instead of starting a second one. A rejection propagates to
      // every waiter and is never written into `this.cached` — see
      // fetchAndCache — so a single failure does not get served for 15s.
      const cached = await this.pending;
      return { ...cached, online: this.presence.count() };
    }

    // Read outside the cache branch on purpose: online-now is what makes the
    // page feel alive, and freezing it for 15 seconds is the one thing this
    // cache must not do.
    return { ...this.cached, online: this.presence.count() };
  }

  /**
   * Runs both queries and populates the resolved-value cache on success.
   * Deliberately does NOT touch `this.cached` (or `this.cachedAt`) if either
   * query rejects, so a transient DB failure is retried on the very next
   * call rather than being remembered — successfully or not — for
   * STATS_CACHE_MS.
   */
  private async fetchAndCache(now: number): Promise<CachedShape> {
    const [commanders, rows] = await Promise.all([
      this.prisma.user.count({ where: { passwordHash: { not: null } } }),
      this.prisma.user.findMany({
        where: ROSTER_WHERE,
        orderBy: ROSTER_ORDER_BY,
        take: PUBLIC_ROSTER_LIMIT,
        select: { userid: true, username: true, score: true, kills: true, planets: true },
      }),
    ]);

    const result: CachedShape = {
      commanders,
      roster: rows.map((row, i) => ({
        rank: i + 1,
        username: row.username ?? row.userid,
        score: row.score.toString(),
        kills: row.kills,
        planets: row.planets,
      })),
    };

    this.cached = result;
    this.cachedAt = now;
    return result;
  }
}
