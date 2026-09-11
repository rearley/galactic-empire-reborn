/**
 * A mutation that lands WHILE a flush is awaiting Postgres must not be lost.
 *
 * `flush()` cleared `state.dirty` after awaiting `prisma.ship.update`. A ship
 * moves every physics tick, so any mutation that arrived during that await had
 * its dirty flag wiped by the completing flush and was never written — the row
 * kept whatever position the in-flight update carried. A ship that keeps moving
 * self-heals on the next mutation; a ship that stops, disconnects, or is evicted
 * inside that window persists a stale position instead.
 *
 * Round-3 playtest, trader persona: one session ended at intra (4484,5060) in
 * hyperspace and the next connection read (5401,4948) — an earlier point on the
 * same flight path — with Postgres agreeing with the stale value. They could not
 * reproduce it deliberately at impulse, which is exactly the signature of a race.
 */
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeState(overrides: Partial<ShipState>): ShipState {
  return baseMakeShip({
    userid: 'player-1',
    shipname: 'Drifter',
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
    items: Array(16).fill(0n) as bigint[],
    topspeed: 8,
    ...overrides,
  });
}

function harness(update: jest.Mock) {
  let capturedFlush: (() => void | Promise<void>) | null = null;
  const prisma = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    ship: { findMany: jest.fn().mockResolvedValue([]), update },
  } as unknown as PrismaService;
  const ticks = {
    subscribe: (kind: TickKind, fn: () => void | Promise<void>) => {
      if (kind === TickKind.SHIP_UPDATE) capturedFlush = fn;
      return () => {};
    },
    registerSnapshotProvider: jest.fn(),
  } as unknown as TickService;
  const svc = new ShipStateService(prisma, ticks);
  return { svc, ticks, flush: () => capturedFlush!() };
}

describe('ShipStateService.flush — mutations landing mid-flush', () => {
  it('keeps the ship dirty when it moves while the write is in flight', async () => {
    const ship = makeState({ dirty: true, xcoord: 5, ycoord: 5 });

    // The write resolves only after we have moved the ship — i.e. the physics
    // tick fired between the Prisma call and its completion.
    let moved = false;
    const update = jest.fn().mockImplementation(async () => {
      if (!moved) {
        moved = true;
        ship.xcoord = 6;
        ship.ycoord = 6;
        ship.dirty = true;
      }
      return {};
    });

    const h = harness(update);
    await h.svc.onModuleInit();
    h.svc.loadShip(ship);

    await h.flush();

    expect(update).toHaveBeenCalledTimes(1);
    // The new position has NOT been written yet, so the ship must still be
    // queued for the next sweep.
    expect(ship.dirty).toBe(true);

    await h.flush();
    expect(update).toHaveBeenCalledTimes(2);
    expect(ship.dirty).toBe(false);
  });

  it('re-queues a ship whose write failed', async () => {
    const ship = makeState({ dirty: true });
    const update = jest.fn().mockRejectedValue(new Error('connection reset'));
    const h = harness(update);
    await h.svc.onModuleInit();
    h.svc.loadShip(ship);

    await h.flush();

    expect(ship.dirty).toBe(true);
  });
});
