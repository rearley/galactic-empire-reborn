/**
 * T006 — ShipStateService.flush() must skip ephemeral (Droid) ships.
 *
 * Droids have no Prisma row — flushing them would throw a not-found error.
 * This test verifies that states with isEphemeral === true are skipped entirely
 * while non-ephemeral dirty states are still written.
 *
 * @see specs/008-droid-ai/spec.md FR-002 — "Droid ships are never persisted to DB"
 * @see src/game/ship/ship-state.service.ts flush() — `if (state.isEphemeral) continue`
 */
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ShipState>): ShipState {
  return baseMakeShip({
    userid: 'test-user',
    shipname: 'TestShip',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    lastfired: 255,
    shieldtype: 2,
    shieldstat: 1,
    shield: 2,
    helm: 1,
    decout: [0, 0, 0, 0, 0],
    freq: [],
    items: Array(16).fill(0n),
    topspeed: 8,
    ...overrides,
  });
}

// ─── T006 ─────────────────────────────────────────────────────────────────────

describe('T006 — ShipStateService.flush skips ephemeral ships', () => {
  it('issues zero Prisma calls for isEphemeral states, one call for the non-ephemeral dirty state', async () => {
    // Capture the SHIP_UPDATE subscriber registered by onModuleInit
    let capturedFlush: (() => void | Promise<void>) | null = null;

    const prismaUpdateMock = jest.fn().mockResolvedValue({});

    const mockPrisma = {
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: prismaUpdateMock,
      },
    } as unknown as PrismaService;

    const mockTickService = {
      subscribe: (kind: TickKind, fn: () => void | Promise<void>) => {
        if (kind === TickKind.SHIP_UPDATE) {
          capturedFlush = fn;
        }
        return () => {};
      },
      registerSnapshotProvider: jest.fn(),
    } as unknown as TickService;

    const svc = new ShipStateService(mockPrisma, mockTickService);
    await svc.onModuleInit();

    expect(capturedFlush).not.toBeNull();

    // ── Seed two ships directly via loadShip ────────────────────────────────

    const ephemeralDroid = makeState({
      userid: '@Droid-31-001',
      shipno: 31001,
      shipname: 'Lydorian Scow',
      isEphemeral: true,
      dirty: true,
    });

    const persistedShip = makeState({
      userid: 'player-1',
      shipno: 1,
      shipname: 'StarHunter',
      isEphemeral: undefined, // no flag → must be flushed
      dirty: true,
    });

    svc.loadShip(ephemeralDroid);
    svc.loadShip(persistedShip);

    // ── Trigger the flush callback ──────────────────────────────────────────
    await capturedFlush!();

    // Prisma.ship.update must have been called exactly once (for persistedShip only)
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);

    // The one call must be for the non-ephemeral ship
    expect(prismaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid_shipno: { userid: 'player-1', shipno: 1 } },
      }),
    );

    // It must NOT have been called for the Droid
    const calls: Array<{ where: { userid_shipno: { userid: string } } }> =
      prismaUpdateMock.mock.calls.map(([arg]: [unknown]) => arg as { where: { userid_shipno: { userid: string } } });
    const droidCall = calls.find((c) => c.where.userid_shipno.userid === '@Droid-31-001');
    expect(droidCall).toBeUndefined();
  });

  it('does not call Prisma when both states are ephemeral', async () => {
    let capturedFlush: (() => void | Promise<void>) | null = null;

    const prismaUpdateMock = jest.fn().mockResolvedValue({});

    const mockPrisma = {
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: prismaUpdateMock,
      },
    } as unknown as PrismaService;

    const mockTickService = {
      subscribe: (kind: TickKind, fn: () => void | Promise<void>) => {
        if (kind === TickKind.SHIP_UPDATE) capturedFlush = fn;
        return () => {};
      },
      registerSnapshotProvider: jest.fn(),
    } as unknown as TickService;

    const svc = new ShipStateService(mockPrisma, mockTickService);
    await svc.onModuleInit();

    svc.loadShip(makeState({ userid: '@Droid-31-001', shipno: 31001, isEphemeral: true, dirty: true }));
    svc.loadShip(makeState({ userid: '@Droid-32-001', shipno: 32001, isEphemeral: true, dirty: true }));
    svc.loadShip(makeState({ userid: '@Droid-33-001', shipno: 33001, isEphemeral: true, dirty: true }));

    await capturedFlush!();

    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });

  it('still flushes multiple non-ephemeral dirty states', async () => {
    let capturedFlush: (() => void | Promise<void>) | null = null;

    const prismaUpdateMock = jest.fn().mockResolvedValue({});

    const mockPrisma = {
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: prismaUpdateMock,
      },
    } as unknown as PrismaService;

    const mockTickService = {
      subscribe: (kind: TickKind, fn: () => void | Promise<void>) => {
        if (kind === TickKind.SHIP_UPDATE) capturedFlush = fn;
        return () => {};
      },
      registerSnapshotProvider: jest.fn(),
    } as unknown as TickService;

    const svc = new ShipStateService(mockPrisma, mockTickService);
    await svc.onModuleInit();

    svc.loadShip(makeState({ userid: 'player-1', shipno: 1, dirty: true }));
    svc.loadShip(makeState({ userid: 'player-2', shipno: 2, dirty: true }));
    svc.loadShip(makeState({ userid: '@Droid-31-001', shipno: 31001, isEphemeral: true, dirty: true }));

    await capturedFlush!();

    expect(prismaUpdateMock).toHaveBeenCalledTimes(2);
  });
});
