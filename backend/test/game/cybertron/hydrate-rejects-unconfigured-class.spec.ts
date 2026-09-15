/**
 * A saved Cybertron whose class is no longer configured must not load.
 *
 * `hydrateAll` filtered on the `Cybrg-` prefix and a live hull, and took the
 * saved `shpclass` on trust. Remove a class from the configuration — or edit
 * `MBMGESHP.MSG` so a class stops being CPU_COMBATIVE — and the old row still
 * loads, as a hull whose class the cache cannot resolve. Everything downstream
 * then falls back: `?? 1` topspeed, `?? 0` acceleration, no category, no
 * `noClaim`. It does not crash; it flies a ghost.
 *
 * Raised as item #6 of the ge-next review. ge-next validates the record against
 * the slot's EXPECTED class, which it can do because it reserves slot ranges
 * per class — a redesign this port deliberately did not take (review item #8).
 * What IS checkable here is weaker and still worth having: the class must still
 * be a configured Cybertron class at all.
 *
 * Skipped rather than DELETED. Deleting live rows during boot is a much larger
 * promise than this evidence supports, and it is not needed: `createSpawn`
 * upserts on `(userid, shipno)`, so the slot is reclaimed by the next spawn
 * either way. A warning names the row so a sysop can see what their config
 * change orphaned.
 *
 * @see docs/audits/2026-09-15-ge-next-bug-review.md #6
 */
import { describe, it, expect, vi } from 'vitest';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';

const CONFIGURED = [{ classNumber: 21 }, { classNumber: 24 }];

function shipRow(shpclass: number, shipno: number) {
  return {
    userid: `Cybrg-${shipno}`, shipno, shipname: 'Scout', shpclass,
    heading: 0, head2b: 0, speed: 0, speed2b: 0, xcoord: 1, ycoord: 1,
    damage: 0, energy: 50_000, phasr: 100, phasrtype: 2, kills: 0, lastfired: 0,
    shieldtype: 2, shieldstat: 0, shield: 0, cloak: 0, degrees: 0, percent: 0,
    tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [], items: Array(16).fill(0n), titem: 0,
    hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: 2, cybmine: 255, cybskill: 10, cybupdate: 100, tick: 6, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
  };
}

function build(ships: ReturnType<typeof shipRow>[]) {
  const loaded: Array<{ shpclass: number }> = [];
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([{ userid: 'Cybrg-1', cash: 0n, ships }]),
      update: vi.fn(),
    },
    shipClass: { findMany: vi.fn().mockResolvedValue(CONFIGURED) },
  } as unknown as PrismaService;
  const shipState = {
    loadShip: vi.fn((s: { shpclass: number }) => { loaded.push(s); }),
  } as unknown as ShipStateService;
  return { repo: new CybertronRepository(prisma, shipState), loaded, prisma };
}

describe('hydrateAll rejects an unconfigured class', () => {
  it('loads a Cybertron whose class is still configured', async () => {
    const { repo, loaded } = build([shipRow(21, 1)]);
    await repo.hydrateAll();
    expect(loaded.map((s) => s.shpclass)).toEqual([21]);
  });

  it('skips one whose class is no longer a configured Cybertron', async () => {
    const { repo, loaded } = build([shipRow(99, 1)]);
    await repo.hydrateAll();
    expect(loaded).toEqual([]);
  });

  it('skips only the orphan, not its neighbours', async () => {
    // The failure that would matter: a config change must not empty the galaxy.
    const { repo, loaded } = build([shipRow(21, 1), shipRow(99, 2), shipRow(24, 3)]);
    await repo.hydrateAll();
    expect(loaded.map((s) => s.shpclass).sort((a, b) => a - b)).toEqual([21, 24]);
  });

  it('asks the database which classes are configured', async () => {
    // Not a hardcoded list: the sysop's configuration is the authority, and it
    // is the thing that changed.
    const { repo, prisma } = build([shipRow(21, 1)]);
    await repo.hydrateAll();
    expect((prisma.shipClass.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});

describe('the guard fails OPEN', () => {
  it('loads everything when the class table is empty', async () => {
    // An unseeded or unreachable ShipClass table means "configuration unknown",
    // not "nothing is configured". Rejecting on that would empty the galaxy of
    // AI at boot — far worse than the ghost hull this guard stops. Caught by
    // persistence.spec.ts, which uses a real database and seeds no classes.
    const loaded: Array<{ shpclass: number }> = [];
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { userid: 'Cybrg-1', cash: 0n, ships: [shipRow(21, 1), shipRow(99, 2)] },
        ]),
        update: vi.fn(),
      },
      shipClass: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const shipState = {
      loadShip: vi.fn((s: { shpclass: number }) => { loaded.push(s); }),
    } as unknown as ShipStateService;

    await new CybertronRepository(prisma, shipState).hydrateAll();

    expect(loaded.map((s) => s.shpclass).sort((a, b) => a - b)).toEqual([21, 99]);
  });
});
