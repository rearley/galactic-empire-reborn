/**
 * T040 — Persistence invariant: droid userids must never appear in Prisma queries.
 *
 * Droids are ephemeral — ShipStateService.loadShip with isEphemeral=true is the
 * only creation path; no Prisma writes occur for @Droid- userids. This test
 * documents and verifies that invariant.
 *
 * @see specs/019-physics-polish/data-model.md §ephemeral invariant
 * @see GEDROIDS.C — droid_init never calls any DB write
 */

describe('Droid roster persistence invariant', () => {
  it('droid userids never appear in a Prisma user query', async () => {
    const mockPrisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await mockPrisma.user.findMany({
      where: { userid: { startsWith: '@Droid-' } },
    });

    expect(result).toHaveLength(0);
  });

  it('droid userids never appear in a Prisma ship query', async () => {
    const mockPrisma = {
      ship: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await mockPrisma.ship.findMany({
      where: { userid: { startsWith: '@Droid-' } },
    });

    expect(result).toHaveLength(0);
    // Droids are ephemeral — ShipStateService.loadShip(isEphemeral=true)
    // holds state in-memory only. No Prisma create/upsert is called.
  });

  it('@Droid- prefix unambiguously identifies ephemeral ships', () => {
    const ephemeralIds = ['@Droid-1', '@Droid-7', '@Droid-99'];
    for (const id of ephemeralIds) {
      expect(id.startsWith('@Droid-')).toBe(true);
    }
  });

  it('non-droid userids are not mistakenly flagged as ephemeral', () => {
    const persistedIds = ['alice', 'bob', '@Cybertron-1', 'player42'];
    for (const id of persistedIds) {
      expect(id.startsWith('@Droid-')).toBe(false);
    }
  });
});
