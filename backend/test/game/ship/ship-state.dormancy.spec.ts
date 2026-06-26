/**
 * T6 — Dormancy: boot-load AI ships only; board/unboard player ships.
 *
 * onModuleInit must load ONLY status=GESTAT_AUTO ships (Cybertrons, Droids).
 * Player ships (status=GESTAT_USER/GESTAT_AVAIL) stay dormant until boarded.
 * board() sets status=GESTAT_USER and inserts into the live map.
 * unboard() explicitly persists status=GESTAT_AVAIL (via updateMany, no-op on
 * 0 rows) then flushes/removes from the map.
 *
 * @see GEMAIN.C:warhupa — ship removed from active list on logout
 * @see GEMAIN.H:209-211 GESTAT_AVAIL=0, GESTAT_USER=1, GESTAT_AUTO=2
 * @see specs/030-multi-ship/task-6-brief.md
 */
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { GESTAT_AVAIL, GESTAT_USER, GESTAT_AUTO } from '../../../src/game/constants';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Minimal in-memory ShipState for seeding the map directly. */
function makeState(overrides: Partial<ShipState> & { userid: string; shipno: number }): ShipState {
  return {
    shipname: 'TestShip',
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 255,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [], items: Array(16).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_AVAIL, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8000, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

/** Minimal Prisma Ship row (enough for prismaShipToState). */
function makeShipRow(overrides: { userid: string; shipno: number; status: number }) {
  return {
    shipname: 'TestShip',
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 255,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [], items: Array(16).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8000, warncntr: 0,
    navTargetX: null, navTargetY: null,
    autoShield: false, autoRepair: false,
    user: null,
    ...overrides,
  };
}

/** Build a ShipStateService with the given Prisma ship rows. */
async function buildSvc(rows: ReturnType<typeof makeShipRow>[]) {
  const updateMock = jest.fn().mockResolvedValue({});
  const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });

  const mockPrisma = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    ship: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: updateMock,
      updateMany: updateManyMock,
    },
  } as unknown as PrismaService;

  const mockTickService = {
    subscribe: (_kind: TickKind, _fn: () => void) => () => {},
    registerSnapshotProvider: jest.fn(),
  } as unknown as TickService;

  const svc = new ShipStateService(mockPrisma, mockTickService);
  await svc.onModuleInit();

  return { svc, mockPrisma, updateMock, updateManyMock };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Dormancy — onModuleInit loads only AI (GESTAT_AUTO) ships', () => {
  it('seeds AUTO ship into map, skips AVAIL and USER ships', async () => {
    const autoRow = makeShipRow({ userid: '@Cyb-001', shipno: 1, status: GESTAT_AUTO });
    const userRow = makeShipRow({ userid: 'player-1', shipno: 1, status: GESTAT_USER });
    const availRow = makeShipRow({ userid: 'player-2', shipno: 1, status: GESTAT_AVAIL });

    // The findMany is now scoped to AUTO ships — but our mock returns all three rows.
    // The test asserts on what actually gets seeded into the map by checking findMany
    // was called with the right filter, and then verifies the map contents.
    // Seed only the AUTO row so the mock reflects the scoped query behavior.
    const { svc, mockPrisma } = await buildSvc([autoRow]);

    // findMany must have been called with status: GESTAT_AUTO filter
    expect(mockPrisma.ship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: GESTAT_AUTO }),
      }),
    );

    // Only the AUTO ship is in the map
    expect(svc.get('@Cyb-001', 1)).toBeDefined();
    expect(svc.size()).toBe(1);

    // If we call buildSvc with all three rows (simulating old behaviour), but the
    // findMany mock returns only the autoRow, the player ships must NOT be in the map.
    // Test the negative: seeding only autoRow means player ships are absent.
    expect(svc.get('player-1', 1)).toBeUndefined();
    expect(svc.get('player-2', 1)).toBeUndefined();
  });

  it('findMany where clause includes { status: GESTAT_AUTO }', async () => {
    const { mockPrisma } = await buildSvc([]);

    const call = (mockPrisma.ship.findMany as jest.Mock).mock.calls[0][0] as {
      where?: { status?: number };
    };
    expect(call.where?.status).toBe(GESTAT_AUTO);
  });
});

describe('Dormancy — board()', () => {
  it('sets status = GESTAT_USER, dirty = true, and inserts state into the map', async () => {
    const { svc } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1, status: GESTAT_AVAIL });

    svc.board(state);

    expect(state.status).toBe(GESTAT_USER);
    expect(state.dirty).toBe(true);
    expect(svc.get('player-1', 1)).toBe(state);
  });

  it('persists status=GESTAT_USER to DB via prisma.ship.updateMany (fire-and-forget)', async () => {
    const { svc, updateManyMock } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1, status: GESTAT_AVAIL });

    svc.board(state);
    // Allow the microtask queue to drain so the fire-and-forget promise resolves
    await Promise.resolve();

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { userid: 'player-1', shipno: 1 },
      data: { status: GESTAT_USER },
    });
  });

  it('board() is idempotent — calling twice does not duplicate in map', async () => {
    const { svc } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1 });

    svc.board(state);
    svc.board(state);

    expect(svc.size()).toBe(1);
    expect(state.status).toBe(GESTAT_USER);
  });
});

describe('Dormancy — unboard()', () => {
  it('persists GESTAT_AVAIL via prisma.ship.updateMany AND removes ship from map', async () => {
    const { svc, updateManyMock, updateMock } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1, status: GESTAT_USER });
    svc.board(state);

    expect(svc.get('player-1', 1)).toBeDefined();

    await svc.unboard('player-1', 1);

    // Status persisted explicitly via updateMany (stateToPrismaUpdate strips status from tick flush)
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { userid: 'player-1', shipno: 1 },
      data: { status: GESTAT_AVAIL },
    });

    // flushAndUnload runs (via ship.update) to persist position/energy/etc.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid_shipno: { userid: 'player-1', shipno: 1 } },
      }),
    );

    // Ship evicted from map
    expect(svc.get('player-1', 1)).toBeUndefined();
  });

  it('sets in-memory status = GESTAT_AVAIL before flush', async () => {
    const { svc } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1, status: GESTAT_USER });
    svc.board(state);

    await svc.unboard('player-1', 1);

    // In-memory state was mutated before removal (dirty=true, status=AVAIL captured)
    expect(state.status).toBe(GESTAT_AVAIL);
  });

  it('does NOT crash when ship row was already deleted (logout-after-death): updateMany is a no-op', async () => {
    const { svc, updateManyMock, updateMock } = await buildSvc([]);
    const state = makeState({ userid: 'player-1', shipno: 1, status: GESTAT_USER });
    svc.board(state);

    // Simulate ship row already deleted (death) — updateMany returns 0 rows, no throw
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    // flushAndUnload calls ship.update but ship row gone → P2025 → logged, not thrown
    updateMock.mockRejectedValueOnce(Object.assign(new Error('Record to update not found.'), { code: 'P2025' }));

    await expect(svc.unboard('player-1', 1)).resolves.not.toThrow();

    // Ship must still be removed from map even if DB row was gone
    expect(svc.get('player-1', 1)).toBeUndefined();
  });

  it('unboard() on a ship not in map is a no-op (no crash)', async () => {
    const { svc, updateManyMock } = await buildSvc([]);

    await expect(svc.unboard('ghost-user', 99)).resolves.not.toThrow();
    // updateMany still called (guard on state, not on DB call)
    expect(updateManyMock).toHaveBeenCalled();
  });
});
