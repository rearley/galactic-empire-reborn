/**
 * T-P016 — ShipStateService.refreshTeamcodes() re-hydrates in-memory teamcode from DB.
 *
 * Regression for P-016: midnight countTeamMembersAndResetOrphans() resets User.teamcode
 * to 0 for orphaned users, but the in-memory ShipState.teamcode is never refreshed.
 * A player connected across midnight keeps a stale teamcode until disconnect/reconnect.
 *
 * @see specs/026-subsystem-damage task-4-brief.md
 * @see src/game/ship/ship-state.service.ts refreshTeamcodes()
 * @see src/game/midnight/midnight.repository.ts countTeamMembersAndResetOrphans()
 */

import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ShipState>): ShipState {
  return baseMakeShip({
    shipname: 'TestShip',
    xcoord: 5,
    ycoord: 5,
    energy: 50000,
    phasr: 100,
    phasrtype: 1,
    lastfired: 255,
    shieldtype: 1,
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

function makeService(userFindManyMock: jest.Mock): ShipStateService {
  const mockPrisma = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    ship: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findMany: userFindManyMock,
    },
  } as unknown as PrismaService;

  const mockTickService = {
    subscribe: (_kind: TickKind, _fn: () => void) => () => {},
    registerSnapshotProvider: jest.fn(),
  } as unknown as TickService;

  return new ShipStateService(mockPrisma, mockTickService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T-P016 — ShipStateService.refreshTeamcodes()', () => {
  it('updates in-memory teamcode when DB returns a different value (orphan reset to 0)', async () => {
    const userFindMany = jest.fn().mockResolvedValue([
      { userid: 'u1', teamcode: 0n }, // midnight reset this to 0
    ]);
    const svc = makeService(userFindMany);
    await svc.onModuleInit();

    // Seed a ship with stale teamcode = 5
    svc.loadShip(makeState({ userid: 'u1', shipno: 1, teamcode: 5n }));

    await svc.refreshTeamcodes();

    const ship = svc.get('u1', 1);
    expect(ship).toBeDefined();
    expect(ship!.teamcode).toBe(0n);
  });

  it('leaves teamcode unchanged when DB value matches in-memory value', async () => {
    const userFindMany = jest.fn().mockResolvedValue([
      { userid: 'u2', teamcode: 42n }, // no change
    ]);
    const svc = makeService(userFindMany);
    await svc.onModuleInit();

    svc.loadShip(makeState({ userid: 'u2', shipno: 1, teamcode: 42n }));

    await svc.refreshTeamcodes();

    const ship = svc.get('u2', 1);
    expect(ship!.teamcode).toBe(42n);
  });

  it('is a no-op when the in-memory map is empty (no DB call needed)', async () => {
    const userFindMany = jest.fn();
    const svc = makeService(userFindMany);
    await svc.onModuleInit();

    // No ships loaded — empty map
    await svc.refreshTeamcodes();

    // Should not call prisma.user.findMany when there are no ships
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('sets teamcode to undefined when DB returns null (user lost team after null reset)', async () => {
    const userFindMany = jest.fn().mockResolvedValue([
      { userid: 'u3', teamcode: null },
    ]);
    const svc = makeService(userFindMany);
    await svc.onModuleInit();

    svc.loadShip(makeState({ userid: 'u3', shipno: 1, teamcode: 5n }));

    await svc.refreshTeamcodes();

    const ship = svc.get('u3', 1);
    expect(ship!.teamcode).toBeUndefined();
  });

  it('updates multiple ships across different users in one pass', async () => {
    const userFindMany = jest.fn().mockResolvedValue([
      { userid: 'ua', teamcode: 0n },
      { userid: 'ub', teamcode: 99n },
    ]);
    const svc = makeService(userFindMany);
    await svc.onModuleInit();

    svc.loadShip(makeState({ userid: 'ua', shipno: 1, teamcode: 5n }));
    svc.loadShip(makeState({ userid: 'ub', shipno: 1, teamcode: 10n }));

    await svc.refreshTeamcodes();

    expect(svc.get('ua', 1)!.teamcode).toBe(0n);
    expect(svc.get('ub', 1)!.teamcode).toBe(99n);
  });
});
