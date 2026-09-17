/**
 * A recycled Cybertron slot must be a FRESH ship, including its destruct timer.
 *
 * `createSpawn` upserts, because a dead Cybertron's row is not always deleted
 * (P-007). Its `update` branch therefore exists to hand the slot's next
 * occupant a clean hull, and it resets some two dozen fields — damage, energy,
 * speed, shields, cloak, cantexit, lastfired, the torpedo and missile arrays,
 * kills, hostile.
 *
 * It did not reset `destruct`. A ship inherits the previous occupant's
 * self-destruct countdown, and `ShipManagementTickService.destructTick` acts on
 * any value above zero — so a brand-new Cybertron can detonate seconds after
 * spawning, for something the ship before it did.
 *
 * Canon never sets `destruct` on an automaton at all: across the whole original
 * it is assigned nonzero in exactly one place, `cmd_destruct` (GECMDS.C:5031),
 * on the calling player's own ship. `initshp` zeroes it (GEFUNCS.C:256), which
 * is what this branch is standing in for.
 */
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { NO_CHANNEL } from '../../../src/game/ship/ship-channel.registry';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { SpawnSlotInit } from '../../../src/game/cybertron/cybertron.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

function slot(): SpawnSlotInit {
  return {
    userid: 'Cybrg-222', shipno: 222, classNumber: 25, topspeed: 15,
    shipname: 'SOBx949345', xcoord: -62, ycoord: 98,
    phasrtype: 16, shieldtype: 5,
    loadout: { fluxpod: 3, decoys: 20, torpedo: 22, mine: 59, jammers: 86, gold: 1146 },
    cybskill: 10, tick: 6,
  };
}

describe('CybertronRepository.createSpawn — a recycled slot is a fresh ship', () => {
  const run = async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          user: {
            upsert: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue({ userid: 'Cybrg-222', cash: 1000n }),
          },
          ship: { upsert },
        });
      }),
      ship: { findUnique: vi.fn().mockResolvedValue(null) },
      user: {},
    } as unknown as PrismaService;

    const shipState = {
      loadShip: vi.fn(), get: vi.fn(),
      findByUserid: vi.fn().mockReturnValue([]),
      findAllShips: vi.fn().mockReturnValue([]),
      removeFromGame: vi.fn(),
    } as unknown as ShipStateService;

    await new CybertronRepository(prisma, shipState).createSpawn(slot());
    return upsert.mock.calls[0][0] as { update: Record<string, unknown> };
  };

  it('clears a self-destruct countdown left by the previous occupant', async () => {
    const { update } = await run();
    expect(update.destruct).toBe(0);
  });

  it('still clears the damage and battle state it always did', async () => {
    // Guards the fix against being written as a blanket rewrite that drops
    // fields the update branch is already responsible for.
    const { update } = await run();
    expect(update.damage).toBe(0);
    expect(update.cantexit).toBe(0);
    expect(update.hostile).toBe(0);
    // NOT 0. This asserted 0 until 2026-09-17, which pinned a real defect: 0 is
    // a valid channel, and canon's "nobody shot this ship" sentinel is -1 —
    // GEFUNCS.C:226 `tmpshp.lastfired = -1;`, enforced by killem at
    // GEFUNCS.C:1105 `if (who >= 0 && who < nships && who != usrn)`. A slot
    // reset to 0 named whoever held channel 0. @see respawn-clears-lastfired.spec.ts
    expect(update.lastfired).toBe(NO_CHANNEL);
  });
});
