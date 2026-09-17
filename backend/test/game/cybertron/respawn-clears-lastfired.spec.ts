/**
 * A recycled Cybertron slot must forget its predecessor's killer as NO_CHANNEL,
 * not as channel 0.
 *
 * Canon seeds every fresh hull with GEFUNCS.C:226 `tmpshp.lastfired = -1;` and
 * killem refuses anything below it at
 * GEFUNCS.C:1105 `if (who >= 0 && who < nships && who != usrn)`. So -1 is the
 * sentinel for "nobody shot this ship" and every value from 0 up is a real
 * channel. This port agrees — `NO_CHANNEL = -1` (ship-channel.registry.ts:11) —
 * but `createSpawn` reset the slot with `lastfired: 0`, which names whoever
 * holds channel 0.
 *
 * It is latent only because `lastfiredBy` is empty on a fresh spawn, so
 * `attackerNameFromLastFired` returns null and the kill reads as uncredited.
 * Production on 2026-09-17 shows exactly that pair on a sysop-killed spawn:
 *
 *   victim=Cybrg-203:203 attacker=none lastfired=0 lastfiredBy=none
 *
 * Close the `lastfiredBy` gap on the droid paths without this, and a respawned
 * Cybertron dying to anything uncredited starts crediting channel 0's player —
 * a silent null becomes a confident wrong answer.
 *
 * @see GEFUNCS.C:226 `tmpshp.lastfired = -1;` (initshp)
 * @see GEFUNCS.C:1105 `if (who >= 0 && who < nships && who != usrn)` (killem)
 * @see https://github.com/rearley/galactic-empire-reborn/issues/42
 */
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NO_CHANNEL } from '../../../src/game/ship/ship-channel.registry';
import type { SpawnSlotInit } from '../../../src/game/cybertron/cybertron.repository';

function buildFakePrisma() {
  const upsertShip = vi.fn().mockResolvedValue({});
  const fakePrisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        user: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ userid: 'Cybrg-test', cash: 1000n }),
        },
        ship: { upsert: upsertShip },
      });
    }),
    ship: { findUnique: vi.fn().mockResolvedValue(null) },
    user: {},
  } as unknown as PrismaService;
  return { fakePrisma, upsertShip };
}

const fakeShipState = {
  loadShip: vi.fn(),
  get: vi.fn(),
  findByUserid: vi.fn().mockReturnValue([]),
  findAllShips: vi.fn().mockReturnValue([]),
  removeFromGame: vi.fn(),
} as unknown as ShipStateService;

function makeSpawnSlot(userid: string, shipno: number): SpawnSlotInit {
  return {
    userid,
    shipno,
    classNumber: 21,
    topspeed: 8,
    shipname: `Cybertron ${shipno}`,
    xcoord: 5.0,
    ycoord: 5.0,
    phasrtype: 2,
    shieldtype: 2,
    loadout: { fluxpod: 10, decoys: 5, torpedo: 5, mine: 10, jammers: 5, gold: 1000 },
    cybskill: 10,
    tick: 6,
  };
}

describe('a recycled Cybertron slot forgets its predecessor', () => {
  it('resets lastfired to NO_CHANNEL, not channel 0', async () => {
    const { fakePrisma, upsertShip } = buildFakePrisma();
    const repo = new CybertronRepository(fakePrisma, fakeShipState);

    await repo.createSpawn(makeSpawnSlot('Cybrg-900', 900));

    expect(upsertShip).toHaveBeenCalled();
    const arg = upsertShip.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(arg.update.lastfired).toBe(NO_CHANNEL);
  });

  it('NO_CHANNEL is canon’s sentinel, and 0 is a real channel', () => {
    // Guards the fix against being "corrected" back to 0 by someone reading
    // the field as a count rather than a channel id.
    expect(NO_CHANNEL).toBe(-1);
    expect(NO_CHANNEL).toBeLessThan(0);
  });
});
