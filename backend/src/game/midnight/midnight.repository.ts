/**
 * Prisma-layer helpers for the midnight maintenance pass.
 *
 * All public methods accept a Prisma transaction client (`tx`) so they
 * compose inside the single `prisma.$transaction(...)` that wraps the full
 * four-phase pass.
 *
 * @see GEMAIN.C:gemidnighta (1084-1335)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { valuePlanet } from './value-pl';
import { buildProductionMailStat, productionMailMsgno } from './mailstat-builder';
import { PLTVCASH, PLTVDIV, TEAMBONU } from './midnight.constants';
import { PLTYPE_PLNT } from '../constants';
import { BASEPRICE, ITEM_VALUE, NUMITEMS, I_MEN, I_FOOD, I_TROOPS } from '../constants/items';
import { NEUTRAL_ZONE_OWNER } from '../combat/neutral-zone';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const KEY_USERID = 'KEY';

export interface PhaseCounters {
  usersUpdated: number;
  planetsProcessed: number;
  mailReportsCreated: number;
  mailDeleted: number;
  teamsReconciled: number;
  teamsRemoved: number;
}

@Injectable()
export class MidnightRepository {
  private readonly logger = new Logger(MidnightRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Phase 1 ──────────────────────────────────────────────────────────────

  /**
   * Zero planets/score/plscore/population for every non-KEY user.
   * klscore is NOT touched — it is the lifetime kill-score accumulator.
   *
   * @see GEMAIN.C:1097-1115 — phase-1 user walk
   */
  async resetUserAccumulators(tx: TxClient): Promise<number> {
    const result = await tx.user.updateMany({
      where: { userid: { not: KEY_USERID } },
      data: { planets: 0, score: 0n, plscore: 0n, population: 0n },
    });
    return result.count;
  }

  // ─── Phase 2 ──────────────────────────────────────────────────────────────

  /**
   * Walk every owned planet of type PLTYPE_PLNT, accumulate per-owner
   * totals (planets, population, plscore) and insert one MailStat
   * production-report row per planet.
   *
   * Optimized: bulk-loads all planets and valid owners in two queries,
   * then batches updates and inserts to satisfy the SC-005 budget.
   *
   * FR-011/FR-012: planets with empty userid or unknown owner are silently skipped.
   *
   * @see GEMAIN.C:1120-1170 — phase-2 planet walk
   */
  async processOwnedPlanets(
    tx: TxClient,
    runDate: Date = new Date(),
  ): Promise<{ planetsProcessed: number; mailReportsCreated: number }> {
    const planets = await tx.planet.findMany({
      where: {
        type: PLTYPE_PLNT,
        userid: { not: null, notIn: ['', KEY_USERID] },
      },
    });

    if (planets.length === 0) return { planetsProcessed: 0, mailReportsCreated: 0 };

    // Load all existing users at once for FK validation
    const candidateUserids = [...new Set(planets.map((p) => p.userid).filter(Boolean) as string[])];
    const existingUsers = await tx.user.findMany({
      where: { userid: { in: candidateUserids } },
      select: { userid: true },
    });
    const validUserids = new Set(existingUsers.map((u) => u.userid));

    // Per-owner accumulation (in-memory)
    const userDeltas = new Map<string, { planets: number; population: bigint; plscore: bigint }>();

    let planetsProcessed = 0;
    const mailRows: ReturnType<typeof buildProductionMailStat>[] = [];

    for (let i = 0; i < planets.length; i++) {
      const planet = planets[i];
      const uid = planet.userid;
      if (!uid) continue;

      if (uid === NEUTRAL_ZONE_OWNER) {
        // The trading posts are held by the system and refreshed in phase 0.
        // They have no User row, and no score or production report is owed.
        continue;
      }

      if (!validUserids.has(uid)) {
        this.logger.warn(`midnight phase-2: planet at (${planet.xsect},${planet.ysect}) has unknown owner ${uid} — skipping`);
        continue;
      }

      // ITEM_VALUE, not BASEPRICE. Canon scores a planet from the item
      // POINT-VALUE table — `value[i] = lngopt(ITMVAL01+i,...)` (GEMAIN.C:563),
      // used as `v += value[i] * (qty[i]/pltvdiv)` (GEMAIN.C:1357). The shipped
      // table is `{Point Value of man: 10}` and ZERO for everything else
      // (MBMGEMSG.MSG:1265-1330). Passing the shop price table instead scored
      // gold at 1000 and a man at 2, so hoarding beat colonising and the only
      // thing canon actually rewards was credited at a fifth of its worth.
      const plScore = valuePlanet(planet.cash, planet.tax, planet.itemsQty, ITEM_VALUE, PLTVCASH, PLTVDIV);
      const popDelta = planet.itemsQty[0] / 10_000n; // I_MEN / 10000

      const existing = userDeltas.get(uid) ?? { planets: 0, population: 0n, plscore: 0n };
      userDeltas.set(uid, {
        planets: existing.planets + 1,
        population: existing.population + popDelta,
        plscore: existing.plscore + plScore,
      });

      // Build MailStat row (insert later in batch).
      // The message number is derived from the DAY and the PLANET, not the
      // clock, so re-running a night collides on the primary key and inserts
      // nothing. @see productionMailMsgno
      mailRows.push(buildProductionMailStat(
        {
          userid: uid,
          name: planet.name,
          xsect: planet.xsect,
          ysect: planet.ysect,
          cash: planet.cash,
          debt: planet.debt,
          tax: planet.tax,
          itemsQty: planet.itemsQty,
        },
        productionMailMsgno(runDate, planet),
      ));
      planetsProcessed++;
    }

    // Batch user updates (one per distinct owner)
    await Promise.all(
      Array.from(userDeltas.entries()).map(([uid, delta]) =>
        tx.user.update({
          where: { userid: uid },
          data: {
            planets: { increment: delta.planets },
            population: { increment: delta.population },
            plscore: { increment: delta.plscore },
          },
        }),
      ),
    );

    // Batch MailStat inserts in chunks to avoid parameter limits
    const MAIL_BATCH = 50;
    for (let i = 0; i < mailRows.length; i += MAIL_BATCH) {
      // skipDuplicates makes a same-day re-run a no-op rather than a second
      // set of reports. Five nights of testing left one player holding 36
      // copies of the same report, with their real distress mail underneath.
      await tx.mailStat.createMany({
        data: mailRows.slice(i, i + MAIL_BATCH),
        skipDuplicates: true,
      });
    }

    return { planetsProcessed, mailReportsCreated: mailRows.length };
  }

  // ─── Phase 3 ──────────────────────────────────────────────────────────────

  /**
   * Delete mail older than `mailDays` days and mail to `*`-prefixed recipients.
   *
   * C has a single mail file (`gebb4`) that `mailit()` writes everything into,
   * production reports included, so one walk purges the lot. The port splits
   * mail across two tables and this only ever swept `Mail` — which nothing in
   * the game writes to. Every real message lands in `MailStat` (production
   * reports, attack notices, economy notices) and the inbox reads only
   * `MailStat`, so nothing ever expired. Both are swept now; `Mail` is
   * currently unwritten but is the schema-faithful shape and costs one
   * statement a night.
   *
   * @see GEMAIN.C:1175-1195 — phase-3 mail purge
   * @see GEMAIN.C:1160-1161 — MAILSTAT production records go through mailit()
   */
  async purgeMail(tx: TxClient, mailDays: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - mailDays * 86_400;

    const results = await Promise.all([
      tx.mailStat.deleteMany({ where: { stamp: { lt: cutoff } } }),
      tx.mailStat.deleteMany({ where: { userid: { startsWith: '*' } } }),
      tx.mail.deleteMany({ where: { stamp: { lt: cutoff } } }),
      tx.mail.deleteMany({ where: { userid: { startsWith: '*' } } }),
    ]);

    return results.reduce((n, r) => n + r.count, 0);
  }

  // ─── Phase 4 helpers ──────────────────────────────────────────────────────

  /**
   * Set score = plscore + klscore for every non-KEY user.
   *
   * @see GEMAIN.C:1253 — tmpusr.score = tmpusr.plscore + tmpusr.klscore
   */
  async setUserScores(tx: TxClient): Promise<void> {
    // Prisma doesn't support column-referencing updates; use raw SQL for this atomic update
    await tx.$executeRaw`
      UPDATE "User"
      SET score = plscore + klscore
      WHERE userid != ${KEY_USERID}
    `;
  }

  /**
   * Assign descending rospos ranks to qualifying users.
   * Qualifiers: score > 0, userid != KEY, userid NOT LIKE '@%'.
   * Non-qualifiers get rospos = 0.
   *
   * @see GEMAIN.C:1302-1332 — rospos assignment pass
   */
  async assignRosterPositions(tx: TxClient): Promise<void> {
    // Reset all to 0 first (non-qualifiers keep 0)
    await tx.user.updateMany({
      where: { userid: { not: KEY_USERID } },
      data: { rospos: 0 },
    });

    // Assign ranked positions using a window function
    await tx.$executeRaw`
      UPDATE "User" u
      SET rospos = ranked.r
      FROM (
        SELECT userid, ROW_NUMBER() OVER (ORDER BY score DESC, userid ASC) AS r
        FROM "User"
        WHERE score > 0
          AND userid != ${KEY_USERID}
          AND userid NOT LIKE '@%'
      ) ranked
      WHERE u.userid = ranked.userid
    `;
  }

  // ─── Phase 4: team helpers ─────────────────────────────────────────────────

  /**
   * Zero teamcount and teamscore for all teams.
   *
   * @see GEMAIN.C:1204-1209 — zero teamtab
   */
  async zeroAllTeams(tx: TxClient): Promise<void> {
    await tx.team.updateMany({ data: { teamcount: 0, teamscore: 0n } });
  }

  /**
   * Walk all non-KEY users. If teamcode > 0 and the team exists, increment
   * teamcount. If team doesn't exist, reset user's teamcode to 0 (orphan).
   *
   * @see GEMAIN.C:1212-1247 — count members, reset orphans
   */
  async countTeamMembersAndResetOrphans(tx: TxClient): Promise<void> {
    const users = await tx.user.findMany({
      where: {
        userid: { not: KEY_USERID },
        teamcode: { gt: 0n },
      },
      select: { userid: true, teamcode: true },
    });

    for (const user of users) {
      if (!user.teamcode || user.teamcode <= 0n) continue;

      const team = await tx.team.findUnique({ where: { teamcode: user.teamcode } });
      if (!team) {
        await tx.user.update({
          where: { userid: user.userid },
          data: { teamcode: 0n },
        });
        this.logger.log(`midnight phase-4: reset orphan teamcode for ${user.userid}`);
      } else {
        await tx.team.update({
          where: { teamcode: user.teamcode },
          data: { teamcount: { increment: 1 } },
        });
      }
    }
  }

  /**
   * For each non-KEY user with teamcode > 0, add TEAMBONU and score/teamcount
   * to their team's teamscore. Both additions happen inside the per-user loop.
   *
   * @see GEMAIN.C:1275 — teambonus added per member (inside per-user loop)
   */
  async applyPerMemberTeamScore(tx: TxClient): Promise<void> {
    const users = await tx.user.findMany({
      // C gates only on `tmpusr.teamcode > 0` — no score test anywhere in the
      // block (GEMAIN.C:1258-1286). Excluding zero-score members meant a
      // team's fresh recruits were counted in `teamcount`, the divisor, while
      // contributing no bonus: the team's score went DOWN for recruiting.
      where: {
        userid: { not: KEY_USERID },
        teamcode: { gt: 0n },
      },
      select: { userid: true, teamcode: true, score: true },
    });

    for (const user of users) {
      if (!user.teamcode) continue;

      const team = await tx.team.findUnique({
        where: { teamcode: user.teamcode },
        select: { teamcount: true },
      });
      if (!team) continue;

      const teamcount = BigInt(Math.max(team.teamcount, 1));
      const memberShare = user.score / teamcount;

      await tx.team.update({
        where: { teamcode: user.teamcode },
        data: { teamscore: { increment: TEAMBONU + memberShare } },
      });
    }
  }

  /**
   * Reset neutral-zone planet inventories and randomize markup.
   * Zygor-3 (plnum=1) gets all 14 items at 1032000; Nexus Prime (plnum=2) gets troops/men/food.
   * Purchases never deplete stock (neutral() check in buy()), so this is cosmetic but faithful.
   *
   * NOT the primary restock any more. In C the GE22e patch lives inside the
   * continuous `plarti` planet loop and fires on the same pass, immediately
   * after `multiply()` has clamped the hub's stock to MAXPL — see
   * `applyNeutralZoneRestock`, called from `PlanetStateService.runEconomicTickFor`.
   * Restoring only here left the shop selling MAXPL quantities for the whole
   * day between midnights. This remains as the boot-state guarantee for a
   * server that has been down (and it writes Postgres, which the in-memory map
   * re-reads on MIDNIGHT_COMPLETED).
   *
   * @see GEMAIN.C:2145-2178 GE22e patch — "Updating Zygor" / "Updating T-station"
   */
  async refreshNeutralZone(tx: TxClient): Promise<void> {
    // Zygor-3: all items — markup = baseprice*2 + rand()%baseprice  @see GEMAIN.C:2154
    const zygorQty   = new Array<bigint>(NUMITEMS).fill(1032000n);
    const zygorSell  = new Array<number>(NUMITEMS).fill(1);
    const zygorMkup  = Array.from({ length: NUMITEMS }, (_, i) =>
      BASEPRICE[i] * 2 + Math.floor(Math.random() * BASEPRICE[i]),
    );
    const zygor = await tx.planet.updateMany({
      where: { xsect: 0, ysect: 0, plnum: 1 },
      data: {
        itemsQty: zygorQty,
        itemsSell: zygorSell,
        itemsMarkup2a: zygorMkup,
      },
    });
    if (zygor.count === 0) this.warnMissingNeutralZone('Zygor', 1);

    // Nexus Prime: troops, men, food only  @see GEMAIN.C:2162-2174
    const nexusMkup = new Array<number>(NUMITEMS).fill(0);
    nexusMkup[I_TROOPS] = BASEPRICE[I_TROOPS] * 2 + Math.floor(Math.random() * BASEPRICE[I_TROOPS]);
    nexusMkup[I_MEN]    = BASEPRICE[I_MEN]    * 2 + Math.floor(Math.random() * BASEPRICE[I_MEN]);
    nexusMkup[I_FOOD]   = BASEPRICE[I_FOOD]   * 2 + Math.floor(Math.random() * BASEPRICE[I_FOOD]);
    const nexusQty  = new Array<bigint>(NUMITEMS).fill(0n);
    nexusQty[I_TROOPS] = 1032000n;
    nexusQty[I_MEN]    = 1032000n;
    nexusQty[I_FOOD]   = 1032000n;
    const nexusSell = new Array<number>(NUMITEMS).fill(0);
    nexusSell[I_TROOPS] = 1;
    nexusSell[I_MEN]    = 1;
    nexusSell[I_FOOD]   = 1;
    const tstation = await tx.planet.updateMany({
      where: { xsect: 0, ysect: 0, plnum: 2 },
      data: {
        itemsQty: nexusQty,
        itemsSell: nexusSell,
        itemsMarkup2a: nexusMkup,
      },
    });
    if (tstation.count === 0) this.warnMissingNeutralZone('Tahanian Station', 2);
  }

  /**
   * Restocking a neutral-zone planet that is not in the galaxy is a no-op, not
   * a failure. `update` threw `Record to update not found` and, because this
   * runs inside the nightly `$transaction`, took scoring, production and mail
   * down with it — a whole missed midnight over two absent shop planets. Any
   * galaxy generated without the neutral zone (every fresh integration DB)
   * reproduced it.
   */
  private warnMissingNeutralZone(name: string, plnum: number): void {
    this.logger.warn(
      `neutral zone: no planet at 0,0 #${plnum} (${name}) — skipping restock`,
    );
  }

  /**
   * Mark teams with no members as removed.
   *
   * C frees the team's slot in the fixed `teamtab` array by overwriting its
   * code with -1. That does not translate to a table whose primary key IS the
   * teamcode: the port used to write -1n into it, so the second empty team in
   * any pass hit a unique-constraint error that escaped the enclosing
   * `$transaction` and rolled the entire nightly job back — permanently, since
   * the -1 row survived to collide again on every retry. The marker lives in
   * its own column instead.
   *
   * @see GEMAIN.C:1287-1294 — remove empty teams
   */
  async markEmptyTeamsRemoved(tx: TxClient): Promise<{ teamsReconciled: number; teamsRemoved: number }> {
    const teams = await tx.team.findMany({
      where: { teamcode: { gt: 0n }, removed: false },
      select: { teamcode: true, teamcount: true },
    });

    const reconciled = teams.filter((t) => t.teamcount > 0).length;

    const emptyTeams = teams.filter((t) => t.teamcount === 0);
    if (emptyTeams.length > 0) {
      await tx.team.updateMany({
        where: { teamcode: { in: emptyTeams.map((t) => t.teamcode) } },
        data: { removed: true },
      });
    }

    return { teamsReconciled: reconciled, teamsRemoved: emptyTeams.length };
  }
}
