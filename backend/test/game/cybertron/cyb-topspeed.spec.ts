/**
 * A spawned Cybertron must carry its class's top speed, or it cannot move.
 *
 * Round-4 playtest, verified in the live database: all 24 Cybertrons had
 * `topspeed = 0`, `speed = 0`, `speed2b = 0`, and two position snapshots 75
 * seconds apart were identical. Not one of them had moved.
 *
 * `createSpawn`'s `shipData` never wrote `topspeed`, so Prisma's
 * `topspeed Int @default(0)` (schema.prisma:171) applied. Every movement order
 * in `cybLives` derives from `const topSpeed = (ship.topspeed ?? 0) * 1000.0`
 * (cybertron-tick.service.ts:231), so every one evaluated to zero: the ship
 * rolled a heading, rotated on the spot, and stayed there. The repository's own
 * kick-start is guarded `state.topspeed > 0`, so that never fired either.
 *
 * Canon assigns it at creation — `tmpshp.topspeed = shipclass[...].max_warp`
 * (GEFUNCS.C:278), repeated on repair at :421 — and our droid spawner already
 * does the same (droid-spawner.ts:101). Only Cybertrons were missed.
 *
 * The blast radius is the whole AI: no Cybertron approached, engaged or fired
 * on a connected player in ~11 hours of play across three accounts, and the
 * APPROACH and BRAKE taunt bands are unreachable because both only fire while
 * closing on a target.
 */
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import type { SpawnSlotInit } from '../../../src/game/cybertron/cybertron.repository';

const slot = (over: Partial<SpawnSlotInit> = {}): SpawnSlotInit => ({
  userid: 'Cybrg-1', shipno: 1, classNumber: 21, shipname: 'Cybertron 1',
  xcoord: 4.5, ycoord: 4.5, phasrtype: 3, shieldtype: 3,
  loadout: { torpedo: 10, fluxpod: 5, decoys: 5, jammers: 1, mine: 3, gold: 100 } as never,
  cybskill: 5, tick: 0, topspeed: 8,
  ...over,
});

describe('Cybertron spawn — topspeed', () => {
  const build = () => {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      user: { upsert: jest.fn().mockResolvedValue({}) },
      ship: {
        upsert: jest.fn().mockImplementation((args: { create: Record<string, unknown> }) => {
          created.push(args.create);
          return Promise.resolve({ ...args.create, status: 2 });
        }),
      },
    };
    const prisma = {
      $transaction: (fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)),
      // createSpawn re-reads the row to load it into the live map.
      ship: {
        findUnique: () => Promise.resolve(created.length ? { ...created[created.length - 1], status: 2 } : null),
      },
    } as never;
    const shipState = { loadShip: jest.fn(), get: jest.fn() } as never;
    return { repo: new CybertronRepository(prisma, shipState), created };
  };

  it('writes the class max warp, not the schema default of 0', async () => {
    const { repo, created } = build();
    await repo.createSpawn(slot());
    expect(created[0]?.topspeed).toBe(8);
  });

  it('carries whatever the caller read off the class', async () => {
    const { repo, created } = build();
    await repo.createSpawn(slot({ classNumber: 24, userid: 'Cybrg-2', shipno: 2, topspeed: 6 }));
    expect(created[0]?.topspeed).toBe(6);
  });

  it('allows zero for the Base Star, which canon ships immobile', async () => {
    // S23WARP {Maximum Warp: 0} and S23ACCEL 0 — class 23 is a fortress, not a
    // hunter. A blunt `topspeed > 0` guard here would refuse to spawn one, so
    // the real invariant ("the slot carries THIS class's maxWarp") is asserted
    // where the slot is built, not here.
    const { repo, created } = build();
    await repo.createSpawn(slot({ classNumber: 23, userid: 'Cybrg-3', shipno: 3, topspeed: 0 }));
    expect(created[0]?.topspeed).toBe(0);
  });

  it('rejects a nonsense value that could not have come from a class', async () => {
    const { repo } = build();
    await expect(repo.createSpawn(slot({ /* domain-ok: impossible by construction — that is what is being rejected */ topspeed: -1 }))).rejects.toThrow(/topspeed/);
  });
});
