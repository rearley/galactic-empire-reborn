/**
 * T031 — CybertronRepository.incrementKills
 *
 * Verifies that incrementKills performs an atomic Prisma ship.update with
 * kills: { increment: 1 } using the correct userid_shipno composite key.
 *
 * @see GECYBS.C — CYB_BE_NICE/CYB_BE_EASY kill counter escalation
 */
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';

function makeRepo() {
  const shipUpdateMock = vi.fn().mockResolvedValue({});

  // Two-step construction avoids implicit-any circular reference.
  const transactionFn = vi.fn();
  const prisma = {
    ship: { update: shipUpdateMock },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: transactionFn,
  };
  transactionFn.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

  const shipState = {
    findByUserid: vi.fn().mockReturnValue([]),
    loadShip: vi.fn(),
  } as unknown as ShipStateService;

  const repo = new CybertronRepository(prisma as never, shipState);

  return { repo, shipUpdateMock, prisma };
}

describe('CybertronRepository.incrementKills (T031)', () => {
  it('calls ship.update with kills: { increment: 1 } for the correct ship', async () => {
    const { repo, shipUpdateMock } = makeRepo();

    await repo.incrementKills(7, 'Cybrg-3');

    expect(shipUpdateMock).toHaveBeenCalledWith({
      where: { userid_shipno: { userid: 'Cybrg-3', shipno: 7 } },
      data: { kills: { increment: 1 } },
    });
  });

  it('uses the provided shipno and userid as the composite key', async () => {
    const { repo, shipUpdateMock } = makeRepo();

    await repo.incrementKills(42, 'Cybrg-99');

    expect(shipUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid_shipno: { userid: 'Cybrg-99', shipno: 42 } },
      }),
    );
  });

  it('does not throw when Prisma update fails — logs error silently', async () => {
    const { repo, prisma } = makeRepo();
    prisma.ship.update.mockRejectedValue(new Error('DB error'));

    // Should not throw
    await expect(repo.incrementKills(1, 'Cybrg-1')).resolves.toBeUndefined();
  });
});
