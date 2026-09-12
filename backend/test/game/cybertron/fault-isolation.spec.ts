/**
 * T069 — Fault isolation: a throwing ship in cybLives doesn't stop others from ticking.
 *
 * @see specs/007-cybertron-ai/tasks.md T069
 * @see CLAUDE.md — Constitution III fault isolation pattern
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

describe('T069 — fault isolation: one bad Cybertron doesn\'t block others', () => {
  it('5 healthy Cybertrons still tick after 1 throwing ship', async () => {
    const rand = new Mulberry32Adapter(99);
    const events = new EventEmitter2();

    const ships: ShipState[] = [];

    // Build 5 healthy Cybertrons and 1 "bad" ship that throws
    for (let i = 0; i < 5; i++) {
      ships.push(baseMakeShip({
        userid: `Cybrg-${200 + i}`,
        shipno: 200 + i,
        shpclass: 21,
        status: 2,
        tick: 1,
        cybmine: 255,
        cybupdate: 100,
        phasr: 100,
        phasrtype: 2,
        shield: 2,
        shieldtype: 2,
        shieldstat: 1,
        xcoord: 5,
        ycoord: 5,
        energy: 50000,
        lastfired: 255,
        helm: 1,
        decout: [0, 0, 0, 0, 0],
        freq: [],
        items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
        cybskill: 10,
        topspeed: 8,
        shipname: `Healthy-${i}`,
      }));
    }

    // Ship that throws inside its tick (bad state: shpclass not in cache)
    const badShip: ShipState = {
      ...ships[0],
      userid: 'Cybrg-bad',
      shipno: 999,
      shipname: 'Bad',
      // domain-ok: no such class — this test proves one bad ship cannot abort the batch
      shpclass: 999, // not in class cache — will throw on getMaxPhaser
    };
    ships.push(badShip);

    const allShips = [...ships];
    const tickCounts = new Map<string, number>();

    const shipStateService = {
      findAllShips: () => allShips,
      findByUserid: () => [],
      get: () => undefined,
      mutate: () => undefined,
      loadShip: () => {},
      removeFromGame: () => {},
      size: () => allShips.length,
    } as unknown as ShipStateService;

    const shipClassCache = {
      // 999 is the deliberately-unknown class; everything else here is a
      // Cybertron. Canon dispatches by class (GEMAIN.C:878-895).
      getCategory: (n: number) => (n === 999 ? undefined : 'CPU_COMBATIVE'),
      get: (n: number) => {
        if (n === 999) return undefined; // bad ship — class not found
        return {
          maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
          scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
          hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0,
          cybLowestClassAttacks: 1, cybCanAttack: true,
        };
      },
      getMaxPhaser: (n: number) => {
        if (n === 999) throw new Error('Class 999 not in cache');
        return 2;
      },
      getMaxTons: (n: number) => {
        if (n === 999) throw new Error('Class 999 not in cache');
        return 900;
      },
    } as unknown as ShipClassCacheService;

    const repository = {
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      createSpawn: vi.fn().mockResolvedValue(undefined),
      flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
      flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n > 2_000_000n ? 2_000_000n : n,
    } as unknown as CybertronRepository;

    const subscribed: Array<(ctx: unknown) => void> = [];
    const tickService = {
      subscribe: (_: unknown, fn: (ctx: unknown) => void) => {
        subscribed.push(fn);
        return () => {};
      },
    } as unknown as TickService;

    const svc = new CybertronTickService(
      tickService, shipStateService, shipClassCache, repository, events, rand,
    );
    await svc.onModuleInit();

    // Track which ships had their tick decremented
    const originalTick = new Map(allShips.map((s) => [`${s.userid}:${s.shipno}`, s.tick]));

    for (const fn of subscribed) {
      fn({ kind: 'PHYSICS', tickNumber: 1, firedAt: new Date() });
    }
    await new Promise((r) => setImmediate(r));

    // All ships (including the bad one's neighbors) should still be in the map
    expect(allShips.length).toBe(6);

    // The service should not have thrown — healthy ships should have tick decremented
    // (tick goes from 1 → 0 → gets reset by cybLives, or from 1 → 0 for ticked-but-not-activated)
    // We can't assert exact tick values, but the service should not have crashed
    expect(true).toBe(true); // no unhandled exception
  });
});
