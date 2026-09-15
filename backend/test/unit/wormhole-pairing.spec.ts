/**
 * Canon pairs wormholes. Ours never did.
 *
 * @see GEPLANET.C:392 `/* I know when you look at this later Mike you will never remember why`
 * — Murdock explaining it to his future self:
 *
 *     If on the second pass Xgetsector gets a sector that already exists then
 *     we have to insert a wormhole into the next planet slot and create
 *     the planet record. If there are already 9 planets then too bad, this
 *     wormhole is a one way bugger.
 *
 * So a return hole is the RULE and one-way is the documented exception, taken
 * only when the destination sector is full. The port wrote a single row per
 * wormhole and no return, making canon's failure case universal — a player
 * reported it on 2026-09-15 after being flung somewhere with no way back.
 *
 * @see GEPLANET.C:422 `/ * insert new wormhole * /`
 */
import { describe, it, expect } from 'vitest';
import {
  planReturnWormholes,
  occupancyFromSectors,
  sectorKey,
  type WormholeLike,
} from '../../src/game/galaxy/wormhole-pairing';

const MAXP = 9;
const hole = (over: Partial<WormholeLike> = {}): WormholeLike => ({
  xsect: 0, ysect: 0, plnum: 1,
  xcoord: 0.25, ycoord: 0.75,
  destXcoord: 5.5, destYcoord: 7.5,
  ...over,
});

const occupancy = (entries: Array<[string, number]> = []) => new Map(entries);

describe('planReturnWormholes', () => {
  it('puts the return in the destination sector, pointing back at the origin', () => {
    const [ret] = planReturnWormholes([hole()], occupancy([['5,7', 2]]), MAXP);
    // Back to the CENTRE of the origin sector — this port's convention for
    // every wormhole destination, pinned by galaxy-balance G8.3/G8.4.
    expect(ret).toMatchObject({ xsect: 5, ysect: 7, destXcoord: 0.5, destYcoord: 0.5 });
  });

  it('does NOT sit on the arrival point', () => {
    // The trap canon's own placement would spring here. Canon puts the return
    // exactly where you land; this port lands you at the sector CENTRE, so
    // doing that would drop you on top of the return hole and drag you back
    // through on the next gravity check.
    const [ret] = planReturnWormholes([hole()], occupancy([['5,7', 2]]), MAXP);
    expect([ret.xcoord, ret.ycoord]).not.toEqual([5.5, 7.5]);
  });

  it('mirrors the original’s offset within its sector', () => {
    // Deterministic placement: no RNG, which the backfill does not have.
    const [ret] = planReturnWormholes([hole({ xcoord: 0.25, ycoord: 0.75 })], occupancy(), MAXP);
    expect(ret.xcoord).toBeCloseTo(5.25);
    expect(ret.ycoord).toBeCloseTo(7.75);
  });

  it('steps off centre when the original IS centred', () => {
    // The one offset this scheme cannot mirror, because it is the arrival point.
    const [ret] = planReturnWormholes([hole({ xcoord: 0.5, ycoord: 0.5 })], occupancy(), MAXP);
    expect([ret.xcoord, ret.ycoord]).not.toEqual([5.5, 7.5]);
  });

  it('takes the next free slot in the destination sector', () => {
    // @see GEPLANET.C:426 `			worm.plnum = sector.numplan+1;`
    const [ret] = planReturnWormholes([hole()], occupancy([['5,7', 2]]), MAXP);
    expect(ret.plnum).toBe(3);
  });

  it('leaves the hole one-way when the destination sector is full', () => {
    // "then too bad, this wormhole is a one way bugger" — the ONLY case where
    // canon accepts a one-way hole.
    expect(planReturnWormholes([hole()], occupancy([['5,7', MAXP]]), MAXP)).toEqual([]);
  });

  it('fills a sector up and then stops', () => {
    // Two holes landing in the same sector that has one slot left: the first
    // gets its return, the second is a one-way bugger.
    const a = hole({ xsect: 0, ysect: 0 });
    const b = hole({ xsect: 1, ysect: 1, xcoord: 1.1, ycoord: 1.2 });
    const plan = planReturnWormholes([a, b], occupancy([['5,7', MAXP - 1]]), MAXP);
    expect(plan).toHaveLength(1);
    expect(plan[0].destXcoord).toBe(Math.floor(a.xcoord) + 0.5);
  });

  it('does not pair a hole that already has a return', () => {
    // Idempotency — the backfill will be run against a live galaxy, possibly
    // more than once, and must never double-insert.
    const there = hole({
      xsect: 5, ysect: 7, plnum: 3,
      xcoord: 5.5, ycoord: 7.5, destXcoord: 0.25, destYcoord: 0.75,
    });
    expect(planReturnWormholes([hole(), there], occupancy([['5,7', 3], ['0,0', 1]]), MAXP))
      .toEqual([]);
  });

  it('ignores a hole that lands in its own sector', () => {
    // Generation already excludes self-loops; a return hole beside its own
    // mouth would be nonsense rather than merely useless.
    const self = hole({ xsect: 5, ysect: 7, destXcoord: 5.5, destYcoord: 7.5 });
    expect(planReturnWormholes([self], occupancy([['5,7', 1]]), MAXP)).toEqual([]);
  });

  it('treats an unknown destination sector as empty', () => {
    // A sector with no objects has no row in the occupancy map at all.
    const [ret] = planReturnWormholes([hole()], occupancy(), MAXP);
    expect(ret.plnum).toBe(1);
  });
});

describe('occupancyFromSectors', () => {
  it('counts each sector’s used slots', () => {
    const occ = occupancyFromSectors([
      { xsect: 1, ysect: 2, numplan: 3 },
      { xsect: -4, ysect: 5, numplan: 0 },
    ]);
    expect(occ.get(sectorKey(1, 2))).toBe(3);
    expect(occ.get(sectorKey(-4, 5))).toBe(0);
  });

  it('marks the origin sector full so the neutral zone is never added to', () => {
    // (0,0) is canon-fixed data from MBMGEMSG.MSG's S00P* entries, written
    // outside the generation buffer. A return wormhole inserted there would
    // both collide with the fixed plnum layout and change a sector the
    // original defines exactly. Holes POINTING OUT of the origin still get
    // their returns; only the reverse direction is declined.
    const occ = occupancyFromSectors([{ xsect: 0, ysect: 0, numplan: 6 }], 9);
    expect(occ.get(sectorKey(0, 0))).toBe(9);
  });
});
