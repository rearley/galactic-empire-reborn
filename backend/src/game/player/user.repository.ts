import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROSTER_WHERE, ROSTER_ORDER_BY, RosterRow } from './roster-query';
import type { TxClient } from '../../prisma/tx-client';

/** The public board renders everything canon's `ros` does except population. */
export type PublicRosterRow = Omit<RosterRow, 'population'>;

/** What onboarding writes to the User row when it hands out a hull. */
export interface OnboardingGrant {
  cash?: bigint;
  noships: number;
  topshipno: number;
}

/**
 * The `User` row as gameplay reads and writes it — commands, ticks, the socket
 * layer and the public board.
 *
 * The `User` table is canon's `WARUSR` (GEMAIN.H) — the per-captain record that
 * outlives any one hull: cash, score, kills, planet count, team membership and
 * the option flags. Ship state lives in memory and is flushed; this row is read
 * and written directly, so every statement that touches it is here rather than
 * scattered across twenty-odd call sites.
 *
 * It is NOT the only place the table is touched, and a reader should grep
 * rather than trust this sentence. Four other files hold `prisma.user.*`
 * legitimately, and `test/invariants/user-repository-boundary.spec.ts` is the
 * list that must stay true:
 *
 *  - `cybertron/cybertron.repository.ts` — Cybertron hydration with
 *    `include: { ships: true }` and the `CYB_MAXCASH` clamp. Its
 *    `flushUsersImmediate` writes REAL players' cash too, not only AI rows.
 *  - `team/team.repository.ts` — the `groupBy` that counts live members.
 *  - `player/player-score.repository.ts` — `rospos`, for the midnight job.
 *  - `auth/auth.service.ts` — account lifecycle: register, login, username.
 *
 * Each method issues exactly the statement the call site it replaced issued —
 * same `where`, same `select`, same verb. The one exception is deliberate:
 * `incrementPlanets` used to have an `updateMany` twin for the claim path, so
 * the same counter threw on one route and went silent on the other. Canon has
 * one routine for both (GECMDS.C:4001 `++waruptr->planets`), and the loud verb
 * is the one that survived. @see issue #15
 *
 * ## This class must stay stateless and constructible from `(prisma)` alone
 *
 * Eleven classes that still hold `PrismaService` for other models take this
 * repository as an `@Optional()` constructor parameter defaulting to
 * `new UserRepository(prisma)`. That is only safe while a second instance is
 * indistinguishable from the shared one: no fields beyond `prisma`, no cache,
 * no counters, no second constructor parameter.
 *
 * Add a memoised roster or a `Logger` parameter and it breaks silently — Nest's
 * singleton gets the new behaviour, the eleven inline defaults construct their
 * own object and do not. Nothing fails to boot and no test goes red; `ros`
 * simply serves a stale board from some call sites and a fresh one from others.
 * If this class ever needs state, the eleven defaults must become required
 * injected parameters in the same commit.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- cash reads

  /**
   * The captain's bank balance, or null when there is no such account.
   *
   * Callers clamp the null to 0 themselves — canon does the same on entry to
   * `cmd_buy`, which zeroes a negative balance before pricing anything.
   * @see GECMDS.C cmd_buy — the clamp itself, with its line numbers, stays
   * at the call site in buy.handler.ts.
   */
  async getCash(userid: string): Promise<bigint | null> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { cash: true },
    });
    return row?.cash ?? null;
  }

  /**
   * Cash plus the fleet counters, for `new ship` — the fleet cap and the
   * monotonic ship number are both decided from the same row as the price.
   * @see GEMAIN.C MAXSHIPS
   */
  async getCashAndFleet(
    userid: string,
  ): Promise<{ cash: bigint; noships: number; topshipno: number } | null> {
    return this.prisma.user.findUnique({
      where: { userid },
      select: { cash: true, noships: true, topshipno: true },
    });
  }

  /**
   * The highest ship number ever issued to this captain.
   *
   * `topshipno === 0` is the only reliable "never owned a hull" signal — ship
   * numbers are never reused, so it stays 0 exactly until the first ship exists.
   */
  async getTopshipno(userid: string): Promise<number | null> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { topshipno: true },
    });
    return row?.topshipno ?? null;
  }

  // ------------------------------------------------------------- profile reads

  /** The account block `rep acc` prints. @see GECMDS.C cmd_report REP25-REP28 */
  async getAccountSummary(userid: string): Promise<{
    cash: bigint;
    score: bigint;
    kills: number;
    planets: number;
    teamcode: bigint | null;
  } | null> {
    return this.prisma.user.findUnique({
      where: { userid },
      select: { cash: true, score: true, kills: true, planets: true, teamcode: true },
    });
  }

  /**
   * A captain's display handle, for rendering a planet's owner.
   *
   * Null covers both "no such account" and "signup abandoned before a handle
   * was chosen"; callers fall back to the userid in either case, which is what
   * the single inline query this replaces did.
   */
  async getUsername(userid: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { username: true },
    });
    return row?.username ?? null;
  }

  /**
   * Whether the account still exists, read as narrowly as possible.
   *
   * A valid JWT with no User row means the database was reset under the
   * account; the socket layer forces a logout rather than letting onboarding
   * update a row that is not there.
   */
  /**
   * The account's display name, read live.
   *
   * Exists because sysop identity must not be answered from a JWT claim: the
   * token lasts 30 days and its `username` is `null` for an account that had
   * not finished step 2 when it was minted, so a stale token can quietly
   * demote the sysop until they log in again.
   * @see auth/sysop.ts
   */
  async findUsername(userid: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { username: true },
    });
    return row?.username ?? null;
  }

  async exists(userid: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { userid: true },
    });
    return row !== null;
  }

  /**
   * What a reconnecting session rehydrates onto its in-memory ship: team, the
   * four option flags, cumulative captain kills (a veteran boarding a fresh
   * hull keeps the Cybertron standing they earned), handle and f-key bindings.
   * @see GECYBS.C — the escalation counter; the cited lines stay beside the
   * assignment in connection-lifecycle.service.ts.
   */
  async getSessionProfile(userid: string): Promise<{
    teamcode: bigint | null;
    options: number[];
    kills: number;
    username: string | null;
    fkeys: string[];
  } | null> {
    return this.prisma.user.findUnique({
      where: { userid },
      select: { teamcode: true, options: true, kills: true, username: true, fkeys: true },
    });
  }

  /**
   * The raw option-flag array, read before a `set` toggle rewrites one slot.
   * The array is read whole and written whole because canon's `options[30]` is
   * one field. @see GECMDS.C cmd_set — `#define NUMOPTS 4`
   */
  async getOptions(userid: string): Promise<number[] | null> {
    const row = await this.prisma.user.findUnique({
      where: { userid },
      select: { options: true },
    });
    return row?.options ?? null;
  }

  // ---------------------------------------------------------------- team reads

  /**
   * A `team kick` target, as the two columns the check needs: the userid proves
   * the account exists, the teamcode proves it is on the kicker's team. Canon
   * checks in that order. @see GECMDS.C cmd_team kick — the line range stays
   * on `kickMember` in team.service.ts, which performs those checks.
   */
  async findTeamMembership(userid: string): Promise<{ userid: string; teamcode: bigint | null } | null> {
    return this.prisma.user.findUnique({
      where: { userid },
      select: { userid: true, teamcode: true },
    });
  }

  /**
   * Team membership for a batch of captains, so the live ship map can be
   * reconciled against the database in one statement rather than per ship.
   */
  async findTeamcodesFor(userids: string[]): Promise<Array<{ userid: string; teamcode: bigint | null }>> {
    return this.prisma.user.findMany({
      where: { userid: { in: userids } },
      select: { userid: true, teamcode: true },
    });
  }

  /**
   * A team's roster, in userid order and capped at the caller's TEAMMAX so a
   * dangling teamcode cannot produce an unbounded list.
   * @see GECMDS.C cmd_team
   */
  async listTeamMemberIds(teamcode: bigint, take: number): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { teamcode },
      select: { userid: true },
      orderBy: { userid: 'asc' },
      take,
    });
    return rows.map((r) => r.userid);
  }

  // -------------------------------------------------------------- roster reads

  /**
   * Canon's scoreboard for the in-game `ros`. The predicate and ordering live
   * in `roster-query.ts` so this and the public board can never disagree.
   * @see GECMDS.C cmd_geroster — `roster-query.ts` carries the line numbers.
   */
  async findRoster(take: number): Promise<RosterRow[]> {
    return this.prisma.user.findMany({
      where: ROSTER_WHERE,
      orderBy: ROSTER_ORDER_BY,
      take,
      select: { userid: true, username: true, score: true, kills: true, planets: true, population: true },
    });
  }

  /**
   * The same board rendered in HTML. It reads one column fewer than `ros` —
   * the public page has no population column — so it is a separate statement
   * rather than a shared one with a wider select.
   */
  async findPublicRoster(take: number): Promise<PublicRosterRow[]> {
    return this.prisma.user.findMany({
      where: ROSTER_WHERE,
      orderBy: ROSTER_ORDER_BY,
      take,
      select: { userid: true, username: true, score: true, kills: true, planets: true },
    });
  }

  /**
   * How many people signed up — a different question from the roster, which
   * omits anyone who has never scored, and so a different predicate. Rows with
   * no password hash (the Cybertrons) can never log in and are not people.
   */
  async countRegistered(): Promise<number> {
    return this.prisma.user.count({ where: { passwordHash: { not: null } } });
  }

  // --------------------------------------------------------------- cash writes

  /** Credit the bank atomically — sale proceeds, a planet withdrawal, a sysop grant. */
  async addCash(userid: string, amount: bigint): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { cash: { increment: amount } },
    });
  }

  /**
   * Spend, but only if the balance still covers it.
   *
   * The affordability check is re-issued in the same statement that decrements,
   * which is the only place it cannot be raced: the balance every caller read
   * beforehand was read before a lock, and twenty concurrent buys all saw it.
   * @returns false when nothing was written.
   * @see docs/audits/2026-09-09-security-review.md M1
   */
  async debitIfAffordable(userid: string, amount: bigint): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { userid, cash: { gte: amount } },
      data: { cash: { decrement: amount } },
    });
    return count > 0;
  }

  /** Set an absolute balance — the negative-balance clamp, and the debug outfitter. */
  async setCash(userid: string, cash: bigint): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { cash },
    });
  }

  /**
   * A shipyard fitting: charge `cost`, or pay back `credit` when the trade-in
   * exceeds the new part's price. Exactly one of the two is non-zero, and the
   * caller decides which — the direction is part of the statement because
   * `cash - x` and `cash + (-x)` are not the same write.
   * @see GECMDS.C cmd_new — NEW29 quotes the trade-in, NEW19 charges for it;
   * both cited by line where they are printed, in new-ship.handler.ts.
   */
  async applyUpgradeCharge(userid: string, cost: bigint, credit: bigint): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { cash: cost > 0n ? { decrement: cost } : { increment: credit } },
    });
  }

  // -------------------------------------------------------------- other writes

  /** Join a team, or leave one by passing null. @see GECMDS.C cmd_team */
  async setTeamcode(userid: string, teamcode: bigint | null, tx?: TxClient): Promise<void> {
    await (tx ?? this.prisma).user.update({
      where: { userid },
      data: { teamcode },
    });
  }

  /** Write the option-flag array back whole. @see GECMDS.C cmd_set */
  async setOptions(userid: string, options: number[]): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { options },
    });
  }

  /** Write the f-key binding array back whole. PORT-ORIGINAL; canon has no f-keys. */
  async setFkeys(userid: string, fkeys: string[]): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { fkeys },
    });
  }

  /**
   * `++waruptr->planets` after winning a world — by invasion or by claim.
   *
   * `update`, so a missing row throws P2025. The caller is always the pilot who
   * just took the planet, and their row must exist; if it does not, something
   * upstream is broken and the tick should say so rather than quietly
   * disagreeing with `pla`. The claim path used `updateMany` and swallowed it.
   * @see GECMDS.C:4001 wonplnt — called from cmd_attack's troop and fighter
   *   branches and from the claim path alike.  @see issue #15
   */
  async incrementPlanets(userid: string): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data: { planets: { increment: 1 } },
    });
  }

  /**
   * `if (--waruptr->planets < 0) waruptr->planets = 0;` — the floor is enforced
   * by the predicate, so the decrement can never take the counter negative.
   * @see GECMDS.C cmd_abandon
   */
  async decrementPlanetsIfPositive(userid: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { userid, planets: { gt: 0 } },
      data: { planets: { decrement: 1 } },
    });
  }

  /**
   * Record a hull handed out by onboarding. The caller composes the fields —
   * `cash` is present only for a captain who has never owned a hull, because C
   * hands out the free replacement without touching the bank.
   * @see GEFUNCS.C — the free-hull branch; the line range and the quoted C
   * stay in onboarding-cash.ts. @see onboarding-cash.ts
   */
  async applyOnboardingGrant(userid: string, data: OnboardingGrant): Promise<void> {
    await this.prisma.user.update({
      where: { userid },
      data,
    });
  }
}
