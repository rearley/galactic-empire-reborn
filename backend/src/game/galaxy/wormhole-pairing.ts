/**
 * The return half of a wormhole.
 *
 * Canon creates wormholes in pairs, and Murdock left a note saying why, which
 * is also the clearest statement of the exception:
 *
 *     If on the second pass Xgetsector gets a sector that already exists then
 *     we have to insert a wormhole into the next planet slot and create
 *     the planet record. If there are already 9 planets then too bad, this
 *     wormhole is a one way bugger.
 *
 * @see GEPLANET.C:403 `   we have to insert a wormhole into the next planet slot and create`
 *
 * So two-way is the rule and one-way is a documented fallback for a full
 * destination sector. This port wrote one row per wormhole and no return at
 * all, which made canon's failure case universal: every wormhole in the galaxy
 * was one-way. A player found it on 2026-09-15 by taking one and discovering
 * there was nothing to take back.
 *
 * Canon pairs at CREATION, sector by sector, because it generates a sector on
 * demand when someone first flies into it. This port generates the whole galaxy
 * up front, so pairing is a pass over the finished set instead — the same rule,
 * applied at the only point where the destination sector's occupancy is
 * actually known. That difference is why this is a function rather than a few
 * lines inside the generator: the same pass has to run against a live galaxy
 * that was generated before the rule existed.
 */

/** The fields this pass reads. Satisfied by both a generation buffer row and a DB row. */
export interface WormholeLike {
  xsect: number;
  ysect: number;
  plnum: number;
  xcoord: number;
  ycoord: number;
  destXcoord: number;
  destYcoord: number;
}

/** A return wormhole to insert. Same shape, ready to write. */
export type ReturnWormhole = WormholeLike;

/** `"x,y"` — the key shape of the occupancy map. */
export function sectorKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Which sector a coordinate falls in. */
function sectorOf(xcoord: number, ycoord: number): { x: number; y: number } {
  return { x: Math.floor(xcoord), y: Math.floor(ycoord) };
}

/**
 * Plan the return wormholes a set of one-way holes is missing.
 *
 * Pure: it reads occupancy and returns rows to insert, writing nothing. The
 * caller decides whether that means a generation buffer or a database.
 *
 * @param wormholes every wormhole under consideration — both the holes needing
 *   returns and the ones that might already BE returns
 * @param occupancy the HIGHEST slot in use per sector, keyed by `sectorKey` —
 *   equivalently the count, since a freshly generated sector fills `plnum`
 *   1..n contiguously. The backfill passes the real maximum instead, because a
 *   live galaxy may have gaps and reusing a `plnum` would collide. A sector
 *   absent from the map is empty.
 * @param maxPlanets canon's `MAXPLANETS` — the point at which a hole stays
 *   one-way
 */
export function planReturnWormholes(
  wormholes: readonly WormholeLike[],
  occupancy: ReadonlyMap<string, number>,
  maxPlanets: number,
): ReturnWormhole[] {
  // Mutable copy: a sector that takes a return hole has one fewer slot for the
  // next one, exactly as canon's `sector.numplan++` means for the next pass.
  const used = new Map(occupancy);

  // Every (destination sector) <- (origin sector) link that already exists, so
  // a hole with a return is skipped. This is what makes the pass idempotent,
  // which matters because it runs against a live galaxy and may be run twice.
  const paired = new Set<string>();
  for (const w of wormholes) {
    const dest = sectorOf(w.destXcoord, w.destYcoord);
    paired.add(`${sectorKey(w.xsect, w.ysect)}->${sectorKey(dest.x, dest.y)}`);
  }

  const plan: ReturnWormhole[] = [];
  for (const w of wormholes) {
    const dest = sectorOf(w.destXcoord, w.destYcoord);
    const from = sectorKey(w.xsect, w.ysect);
    const to = sectorKey(dest.x, dest.y);

    // A hole that lands in its own sector. Generation already excludes these;
    // a return beside its own mouth would be nonsense rather than just useless.
    if (from === to) continue;

    // Something in the destination sector already points back here.
    if (paired.has(`${to}->${from}`)) continue;

    const slots = used.get(to) ?? 0;
    // @see GEPLANET.C:406 `   wormhole is a one way bugger.`
    if (slots >= maxPlanets) continue;

    // WHERE the return sits is a port decision, and canon's answer cannot be
    // used directly. Canon puts it exactly where the traveller lands and points
    // it exactly at the mouth they came from
    // (@see GEPLANET.C:427 `			worm.coord.xcoord =  wormtab[i].coord.xcoord;`).
    // Here every
    // wormhole delivers you to the CENTRE of its destination sector — a
    // deliberate port convention, pinned by galaxy-balance's G8.3/G8.4 — so a
    // return hole placed canon's way would sit precisely on the arrival point
    // and drag the traveller straight back out again.
    //
    // So the return takes the same position WITHIN its sector that the original
    // takes within its own: deterministic, needs no RNG (the backfill has none),
    // spreads returns as naturally as the originals, and leaves the traveller a
    // short flight to a hole they can see on scan rather than a trapdoor under
    // their feet.
    const offsetX = w.xcoord - Math.floor(w.xcoord);
    const offsetY = w.ycoord - Math.floor(w.ycoord);
    // ...unless the original sits dead centre, which is exactly the arrival
    // point. Rare — `sampleCoord` does not favour it — but it is the one case
    // this scheme cannot express, so step off it.
    const centred = offsetX === 0.5 && offsetY === 0.5;

    plan.push({
      xsect: dest.x,
      ysect: dest.y,
      // @see GEPLANET.C:426 `			worm.plnum = sector.numplan+1;`
      plnum: slots + 1,
      xcoord: dest.x + (centred ? 0.25 : offsetX),
      ycoord: dest.y + (centred ? 0.25 : offsetY),
      // Back to the centre of the sector it came from, like every other hole.
      destXcoord: Math.floor(w.xcoord) + 0.5,
      destYcoord: Math.floor(w.ycoord) + 0.5,
    });
    used.set(to, slots + 1);
    paired.add(`${to}->${from}`);
  }
  return plan;
}

/**
 * Slots already used per sector, for `planReturnWormholes`.
 *
 * `originFull`, when given, is written in as the origin sector's occupancy so
 * that (0,0) can never receive a return hole. The neutral zone is canon-fixed
 * data — the `S00P*` entries of `MBMGEMSG.MSG`, written outside the generation
 * buffer — and inserting into it would both collide with that fixed `plnum`
 * layout and change a sector the original defines exactly. Wormholes pointing
 * OUT of the origin are unaffected and still get their returns, which is the
 * direction a player actually gets stranded by.
 */
export function occupancyFromSectors(
  // `numplan` is optional because Prisma's create-input type makes it so (it
  // has a column default). An absent count is an empty sector, not an error.
  sectors: readonly { xsect: number; ysect: number; numplan?: number }[],
  originFull?: number,
): Map<string, number> {
  const occ = new Map<string, number>();
  for (const s of sectors) occ.set(sectorKey(s.xsect, s.ysect), s.numplan ?? 0);
  if (originFull !== undefined) occ.set(sectorKey(0, 0), originFull);
  return occ;
}
