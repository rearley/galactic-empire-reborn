/**
 * One-off backfill: give existing wormholes the return half canon gives them.
 *
 * Canon pairs wormholes at creation and treats one-way as a documented
 * fallback for a full destination sector:
 *
 *     If there are already 9 planets then too bad, this
 *     wormhole is a one way bugger.
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
 * SAFETY — this writes to a live galaxy, so:
 *   - it INSERTS only; no existing row is updated except a receiving sector's
 *     `numplan`, which canon increments for the same reason
 *   - it never touches sector (0,0); the neutral zone is canon-fixed data
 *   - it never exceeds `maxplanets` slots in a sector
 *   - `plnum` is the highest in use plus one, so it cannot collide with a gap
 *   - it is idempotent: a hole that already has a return is skipped, so a
 *     second run writes nothing
 *   - it is a DRY RUN by default and prints the full plan; `--apply` commits,
 *     in one transaction
 *
 * Usage:
 *   npx ts-node tools/backfill-wormhole-returns.ts            # report only
 *   npx ts-node tools/backfill-wormhole-returns.ts --apply    # write
 */
import { PrismaClient } from '@prisma/client';
import {
  planReturnWormholes,
  sectorKey,
  type WormholeLike,
} from '../src/game/galaxy/wormhole-pairing';
import { PLTYPE_WORM } from '../src/game/constants';

/** Canon's cap. @see GEMAIN.H:119 `#define MAXPLANETS 9` */
const FALLBACK_MAXPLANETS = 9;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

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

    const oneWayLeft = wormholes.length - plan.length;
    console.log(`galaxy: ${wormholes.length} wormholes, maxplanets ${maxPlanets}`);
    console.log(`plan:   ${plan.length} return holes to insert`);
    console.log(`        ${oneWayLeft} stay one-way (full destination sector, self-loop, or already paired)`);
    for (const r of plan.slice(0, 10)) {
      console.log(`        + (${r.xsect},${r.ysect}) slot ${r.plnum} -> (${Math.floor(r.destXcoord)},${Math.floor(r.destYcoord)})`);
    }
    if (plan.length > 10) console.log(`        … and ${plan.length - 10} more`);

    if (!apply) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
      return;
    }
    if (plan.length === 0) {
      console.log('\nNothing to do.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.wormhole.createMany({
        data: plan.map((r) => ({
          xsect: r.xsect, ysect: r.ysect, plnum: r.plnum,
          type: PLTYPE_WORM,
          xcoord: r.xcoord, ycoord: r.ycoord,
          // @see GEPLANET.C:429 `			worm.visible = 1;`
          visible: 1,
          destXcoord: r.destXcoord, destYcoord: r.destYcoord,
          name: '',
        })),
      });
      // The insert bumps the sector. @see GEPLANET.C:444 `			sector.numplan++;`
      const perSector = new Map<string, { x: number; y: number; n: number }>();
      for (const r of plan) {
        const k = sectorKey(r.xsect, r.ysect);
        const e = perSector.get(k) ?? { x: r.xsect, y: r.ysect, n: 0 };
        e.n += 1;
        perSector.set(k, e);
      }
      for (const e of perSector.values()) {
        await tx.sector.updateMany({
          where: { xsect: e.x, ysect: e.y },
          data: { numplan: { increment: e.n } },
        });
      }
    });

    console.log(`\nWrote ${plan.length} return wormholes.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
