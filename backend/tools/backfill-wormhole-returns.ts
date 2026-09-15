/**
 * One-off backfill: give existing wormholes the return half canon gives them.
 *
 * Canon pairs wormholes at creation and treats one-way as a documented
 * fallback for a full destination sector:
 *
 * @see GEPLANET.C:406 `   wormhole is a one way bugger.`
 *
 * This port's generator wrote one row per hole and no return, so EVERY hole in
 * a galaxy generated before 2026-09-15 is one-way. A player found it by taking
 * one out of the neutral zone and discovering there was nothing to come back
 * through. New galaxies are paired by the generator; this brings an existing
 * one in line without a reset, which matters because a reset would destroy
 * every colony in the game.
 *
 * ── ALREADY RUN ───────────────────────────────────────────────────────────
 * Applied to production on 2026-09-15: 4 468 wormholes -> 8 922, with 4 454
 * returns inserted across 4 235 sectors and 14 left one-way (canon's own
 * exception). A second run plans zero. Kept because the rule it applies is not
 * one-off — any galaxy generated before the pairing pass needs it.
 *
 * ── HOW TO ACTUALLY RUN IT ────────────────────────────────────────────────
 * `backend/tools/` is NOT copied into the backend image, so this file cannot be
 * executed where the production database lives. Getting it there means copying
 * it in, and the container's workdir is `/app/backend` (not `/app`), so module
 * paths must be resolved from there. Locally, against a database this machine
 * can reach:
 *
 *     npx ts-node tools/backfill-wormhole-returns.ts            # report only
 *     npx ts-node tools/backfill-wormhole-returns.ts --apply    # write
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 *   - INSERTS only; the sole update is a receiving sector's `numplan`, which
 *     canon increments for the same reason (@see GEPLANET.C:444 `\t\t\tsector.numplan++;`)
 *   - never touches sector (0,0); the neutral zone is canon-fixed data
 *   - never exceeds `maxplanets`, read from GalaxyMeta rather than assumed —
 *     this galaxy runs 5, not canon's 9
 *   - `plnum` is the highest in use plus one, so it cannot collide with a gap
 *   - idempotent: a hole that already has a return is skipped
 *   - DRY RUN by default; `--apply` commits, in one transaction
 *   - `--apply` writes an undo list first, so the insert can be reversed
 */
import { PrismaClient } from '../src/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveDatabaseUrl } from '../src/prisma/database-url';
import { writeFileSync } from 'node:fs';
import {
  planReturnWormholes,
  sectorKey,
  type WormholeLike,
} from '../src/game/galaxy/wormhole-pairing';
import { PLTYPE_WORM } from '../src/game/constants';

/** Canon's cap, used only if GalaxyMeta somehow has none. @see GEMAIN.H:119 `#define MAXPLANETS 9` */
const FALLBACK_MAXPLANETS = 9;

/**
 * Postgres caps a statement at 65 535 bound parameters and a Wormhole row binds
 * ten columns, so a thousand rows per statement stays well inside it.
 */
const CHUNK = 1_000;

/**
 * Long enough for tens of thousands of rows. Prisma's interactive-transaction
 * default is FIVE SECONDS, which the first version of this tool would have died
 * on: it issued one `updateMany` per receiving sector, 4 235 round trips, and
 * `galaxy.service.ts` already records the same timeout killing generation.
 */
const TX_TIMEOUT_MS = 180_000;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error('DATABASE_URL is not set — nothing to connect to.');
    process.exitCode = 1;
    return;
  }
  // Prisma 7 removed `datasources`; a bare `new PrismaClient()` throws here.
  // Same construction as PrismaService. @see src/prisma/prisma.service.ts
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const meta = await prisma.galaxyMeta.findUnique({ where: { id: 1 } });
    if (!meta) {
      console.error('No GalaxyMeta row — this database has no generated galaxy. Aborting.');
      process.exitCode = 1;
      return;
    }
    const maxPlanets = meta.maxplanets ?? FALLBACK_MAXPLANETS;

    const [wormholes, planets] = await Promise.all([
      prisma.wormhole.findMany({
        select: { xsect: true, ysect: true, plnum: true, xcoord: true, ycoord: true,
                  destXcoord: true, destYcoord: true },
      }),
      prisma.planet.findMany({ select: { xsect: true, ysect: true, plnum: true } }),
    ]);

    // The HIGHEST plnum in use per sector, not a count. A live galaxy can have
    // gaps — a planet removed, a slot never filled — and `count + 1` would then
    // name a slot something already occupies.
    const highest = new Map<string, number>();
    const bump = (x: number, y: number, plnum: number): void => {
      const k = sectorKey(x, y);
      highest.set(k, Math.max(highest.get(k) ?? 0, plnum));
    };
    for (const w of wormholes) bump(w.xsect, w.ysect, w.plnum);
    for (const p of planets) bump(p.xsect, p.ysect, p.plnum);

    // The neutral zone is canon-fixed (MBMGEMSG.MSG S00P*) and must not gain
    // objects. Holes pointing OUT of it are still paired — that is the
    // direction that strands people.
    highest.set(sectorKey(0, 0), maxPlanets);

    const plan = planReturnWormholes(wormholes as WormholeLike[], highest, maxPlanets);

    console.log(`galaxy:  ${wormholes.length} wormholes, ${planets.length} planets, maxplanets ${maxPlanets}`);
    console.log(`plan:    ${plan.length} return holes to insert`);
    console.log(`         ${wormholes.length - plan.length} need none (already paired, self-loop, or full destination)`);

    // Belt and braces before a live write: the invariants the planner is
    // supposed to guarantee, re-checked against its output.
    const violations = plan.filter(
      (r) =>
        r.plnum > maxPlanets ||
        (r.xsect === 0 && r.ysect === 0) ||
        !Number.isInteger(r.xsect) || !Number.isInteger(r.ysect) || !Number.isInteger(r.plnum),
    );
    console.log(`         ${violations.length} safety violations (slot overflow, origin sector, non-integer)`);

    if (!apply) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
      return;
    }
    if (violations.length > 0) {
      console.error('ABORT: the plan violates its own invariants; refusing to write.');
      process.exitCode = 1;
      return;
    }
    if (plan.length === 0) {
      console.log('\nNothing to do.');
      return;
    }

    // Written BEFORE the transaction: an insert-only change is reversible only
    // if you know which rows were yours.
    const undoPath = `wormhole-backfill-undo-${Date.now()}.json`;
    writeFileSync(undoPath, JSON.stringify(plan.map((r) => [r.xsect, r.ysect, r.plnum])));
    console.log(`undo list: ${undoPath}`);

    // Per-sector counts, folded into ONE statement. Every value here is an
    // integer the planner produced and the check above re-verified, which is
    // what makes the interpolation safe.
    const perSector = new Map<string, { x: number; y: number; n: number }>();
    for (const r of plan) {
      const k = sectorKey(r.xsect, r.ysect);
      const e = perSector.get(k) ?? { x: r.xsect, y: r.ysect, n: 0 };
      e.n += 1;
      perSector.set(k, e);
    }
    const values = [...perSector.values()].map((e) => `(${e.x},${e.y},${e.n})`).join(',');

    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < plan.length; i += CHUNK) {
          await tx.wormhole.createMany({
            data: plan.slice(i, i + CHUNK).map((r) => ({
              xsect: r.xsect, ysect: r.ysect, plnum: r.plnum,
              type: PLTYPE_WORM,
              xcoord: r.xcoord, ycoord: r.ycoord,
              // @see GEPLANET.C:429 `\t\t\tworm.visible = 1;`
              visible: 1,
              destXcoord: r.destXcoord, destYcoord: r.destYcoord,
              name: '',
            })),
          });
        }
        const touched = await tx.$executeRawUnsafe(
          `UPDATE "Sector" AS s SET numplan = s.numplan + v.n ` +
          `FROM (VALUES ${values}) AS v(xs, ys, n) ` +
          `WHERE s.xsect = v.xs AND s.ysect = v.ys`,
        );
        console.log(`sectors renumbered: ${touched}`);
      },
      { timeout: TX_TIMEOUT_MS, maxWait: 20_000 },
    );

    console.log(`\nWrote ${plan.length} return wormholes. Wormhole rows now: ${await prisma.wormhole.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
