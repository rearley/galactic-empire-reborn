/**
 * T038 — Cybertron spawn-visibility regression.
 * After CybertronRepository.createSpawn(...), the spawned ship must be present
 * in ShipStateService in-memory map synchronously (without server restart).
 *
 * This tests the production code fix from commit b01c009 where CybertronRepository.createSpawn
 * was updated to call ShipStateService.loadShip after the Prisma create so the ship is
 * immediately visible in-memory.
 *
 * @see backend/src/game/cybertron/cybertron.repository.ts createSpawn (lines 90-151)
 * @see specs/007-cybertron-ai/tasks.md T038
 */
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { SpawnSlotInit } from '../../../src/game/cybertron/cybertron.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import type { Mock } from 'vitest';

// ─── Fake Prisma that records calls ──────────────────────────────────────────

function buildFakePrisma(returnedShip: Record<string, unknown>) {
  const upsertMock = vi.fn().mockResolvedValue({});
  const createMock = vi.fn().mockResolvedValue({});
  const findUniqueMock = vi.fn().mockResolvedValue(returnedShip);
  const txFn = vi.fn();

  const fakePrisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        user: { upsert: upsertMock, findUnique: vi.fn().mockResolvedValue({ userid: 'Cybrg-test', cash: 1000n }) },
        ship: { upsert: createMock },
      };
      await fn(tx);
    }),
    ship: {
      findUnique: findUniqueMock,
    },
    user: {},
  } as unknown as PrismaService;

  return { fakePrisma, upsertMock, createMock, findUniqueMock, txFn };
}

// ─── Fake ShipStateService backed by a real Map ───────────────────────────────

function buildFakeShipState() {
  const map = new Map<string, ShipState>();

  const loadShipSpy = vi.fn((state: ShipState) => {
    map.set(`${state.userid}:${state.shipno}`, state);
  });

  const getSpy = vi.fn((userid: string, shipno: number): ShipState | undefined => {
    return map.get(`${userid}:${shipno}`);
  });

  const fakeShipState = {
    loadShip: loadShipSpy,
    get: getSpy,
    findByUserid: vi.fn().mockReturnValue([]),
    findAllShips: vi.fn().mockReturnValue([]),
    removeFromGame: vi.fn(),
  } as unknown as ShipStateService;

  return { fakeShipState, loadShipSpy, getSpy, map };
}

// ─── A minimal ship row shape that prismaShipToState can handle ───────────────

function makeShipRow(userid: string, shipno: number): Record<string, unknown> {
  return {
    userid,
    shipno,
    shipname: `Cybrg-spawn-${shipno}${shipno}`,
    shpclass: 21,
    heading: 0,
    head2b: 0,
    speed: 0,
    speed2b: 0,
    xcoord: 5.0,
    ycoord: 5.0,
    damage: 0,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    kills: 0,
    lastfired: -1,
    shieldtype: 2,
    shieldstat: 0,
    shield: 2,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 0,
    train: 0,
    where: 0,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    decout: [],
    jammer: 0,
    freq: [],
    items: Array(16).fill(0n),
    titem: 0,
    hostile: 0,
    cantexit: 0,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 2,
    cybmine: 255,
    cybskill: 10,
    cybupdate: 100,
    tick: 6,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 4,
    warncntr: 0,
  };
}

// ─── Test slot ────────────────────────────────────────────────────────────────

function makeSpawnSlot(userid: string, shipno: number): SpawnSlotInit {
  return {
    userid,
    shipno,
    classNumber: 21,
    topspeed: 8,
    shipname: `Cybrg-spawn-${shipno}${shipno}`,
    xcoord: 5.0,
    ycoord: 5.0,
    phasrtype: 2,
    shieldtype: 2,
    loadout: { fluxpod: 10, decoys: 5, torpedo: 5, mine: 10, jammers: 5, gold: 1000 },
    cybskill: 10,
    tick: 6,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T038 — Cybertron spawn-visibility: ship immediately in ShipStateService after createSpawn', () => {
  it('calls loadShip after creating the spawn row', async () => {
    const userid = 'Cybrg-spawn-1';
    const shipno = 801;
    const shipRow = makeShipRow(userid, shipno);

    const { fakePrisma, findUniqueMock } = buildFakePrisma(shipRow);
    const { fakeShipState, loadShipSpy } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    // findUnique must have been called to fetch the just-created row
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { userid_shipno: { userid, shipno } },
    });

    // loadShip must have been called with a state containing the correct userid/shipno
    expect(loadShipSpy).toHaveBeenCalled();
    const loadedArg = loadShipSpy.mock.calls[0][0] as ShipState;
    expect(loadedArg.userid).toBe(userid);
    expect(loadedArg.shipno).toBe(shipno);
  });

  it('ship is visible via get() immediately after createSpawn (no restart required)', async () => {
    const userid = 'Cybrg-spawn-2';
    const shipno = 802;
    const shipRow = makeShipRow(userid, shipno);

    const { fakePrisma } = buildFakePrisma(shipRow);
    const { fakeShipState, getSpy } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    // After createSpawn, the ship must be retrievable from the in-memory map
    const visible = getSpy(userid, shipno);
    expect(visible).toBeDefined();
    expect(visible!.userid).toBe(userid);
    expect(visible!.shipno).toBe(shipno);
  });

  it('loaded ship has status=2 (GESTAT_AUTO) after createSpawn', async () => {
    const userid = 'Cybrg-spawn-3';
    const shipno = 803;
    const shipRow = makeShipRow(userid, shipno);

    const { fakePrisma } = buildFakePrisma(shipRow);
    const { fakeShipState, getSpy } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    const ship = getSpy(userid, shipno);
    expect(ship).toBeDefined();
    expect(ship!.status).toBe(2); // GESTAT_AUTO
  });

  it('loaded ship has dirty=false after createSpawn (freshly persisted)', async () => {
    const userid = 'Cybrg-spawn-4';
    const shipno = 804;
    const shipRow = makeShipRow(userid, shipno);

    const { fakePrisma } = buildFakePrisma(shipRow);
    const { fakeShipState, getSpy } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    const ship = getSpy(userid, shipno);
    expect(ship).toBeDefined();
    expect(ship!.dirty).toBe(false);
  });

  it('loadShip is not called if findUnique returns null (graceful no-op)', async () => {
    const userid = 'Cybrg-spawn-5';
    const shipno = 805;

    // findUnique returns null (edge case: DB row not found after create)
    const { fakePrisma } = buildFakePrisma(null as unknown as Record<string, unknown>);
    const { fakeShipState, loadShipSpy } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    // loadShip should NOT be called when findUnique returns null
    expect(loadShipSpy).not.toHaveBeenCalled();
  });

  it('Prisma $transaction is called once during createSpawn', async () => {
    const userid = 'Cybrg-spawn-6';
    const shipno = 806;
    const shipRow = makeShipRow(userid, shipno);

    const { fakePrisma } = buildFakePrisma(shipRow);
    const { fakeShipState } = buildFakeShipState();

    const repo = new CybertronRepository(fakePrisma, fakeShipState);
    await repo.createSpawn(makeSpawnSlot(userid, shipno));

    expect((fakePrisma.$transaction as Mock)).toHaveBeenCalledTimes(1);
  });
});
