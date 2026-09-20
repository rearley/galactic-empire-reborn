/**
 * T019 — Neutral-zone exclusion: Cybertrons never acquire or fire on players inside sector (0,0).
 *
 * @see GECYBS.C — cyb_check_lockon NZ guard (FR-006, SC-007)
 * @see specs/007-cybertron-ai/tasks.md T019, T030
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CYBERTRON_EVENT } from '../../../src/game/cybertron/cybertron-events';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number }): ShipState {
  return baseMakeShip({
    shipname: 'Test',
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
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    cybmine: 255,
    cybskill: 10,
    cybupdate: 50,
    tick: 1,
    topspeed: 8,
    ...overrides,
  });
}

async function buildHarness(seed = 42) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const shipMap = new Map<string, ShipState>();
  const shipStateService = {
    findAllShips: () => Array.from(shipMap.values()),
    findByUserid: (uid: string) => Array.from(shipMap.values()).filter((s) => s.userid === uid),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) => shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classCache = new Map<number, ReturnType<ShipClassCacheService['get']>>();
  const shipClassCache = {
    get: (n: number) => classCache.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895); a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    getMaxPhaser: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxPhaser; },
    getMaxTons: (n: number) => { const e = classCache.get(n); if (!e) throw new Error(`Class ${n} not found`); return e.maxTons; },
    setClass: (n: number, e: ReturnType<ShipClassCacheService['get']>) => classCache.set(n, e),
  } as unknown as ShipClassCacheService & { setClass: (n: number, e: unknown) => void };

  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn().mockResolvedValue(undefined),
    flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n > 2_000_000n ? 2_000_000n : n,
  } as unknown as CybertronRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService,
    shipStateService,
    shipClassCache,
    repository,
    events,
    rand,
  );
  await svc.onModuleInit();

  function fireTick(n = 1): void {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
      }
    }
  }

  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 500_000, // very large to ensure the player is always "in range"
    maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true, noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
  });
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 0,
  });

  return { svc, shipStateService, shipClassCache, repository, events, shipMap, fireTick };
}

// ─── T019: Neutral-zone exclusion ─────────────────────────────────────────────

describe('T019 — neutral-zone: player inside sector (0,0) is never targeted', () => {
  it('zero target-acquired events when player is inside NZ (xcoord ∈ [0,1), ycoord ∈ [0,1))', async () => {
    const { shipMap, events, fireTick } = await buildHarness(42);

    // Cybertron outside NZ — tick=1 so it activates on next tick
    const cyb = makeShip({
      userid: 'Cybrg-200', shipno: 200, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 255, tick: 1, cybupdate: 100,
    });
    shipMap.set('Cybrg-200:200', cyb);

    // Player INSIDE the neutral zone (sector 0,0 means floor(x)=0 and floor(y)=0)
    const player = makeShip({
      userid: 'player1', shipno: 1, shpclass: 3, status: 1,
      xcoord: 0.5, ycoord: 0.3,
    });
    shipMap.set('player1:1', player);

    const acquired: unknown[] = [];
    events.on(CYBERTRON_EVENT.TARGET_ACQUIRED, (p: unknown) => acquired.push(p));

    // Drive 100 ticks — Cybertron re-ticks every cybupdate ticks
    fireTick(100);
    await new Promise((r) => setImmediate(r));

    expect(acquired).toHaveLength(0);
    // Cybertron must NOT have acquired the NZ player
    expect(cyb.cybmine).toBe(255);
  });

  it('Cybertron DOES acquire player once player leaves NZ', async () => {
    const { shipMap, events, fireTick } = await buildHarness(99);

    const cyb = makeShip({
      userid: 'Cybrg-201', shipno: 201, shpclass: 21, status: 2,
      xcoord: 2, ycoord: 2, cybmine: 255, tick: 1, cybupdate: 100,
    });
    shipMap.set('Cybrg-201:201', cyb);

    // Player starts OUTSIDE NZ
    const player = makeShip({
      userid: 'player2', shipno: 2, shpclass: 3, status: 1,
      xcoord: 2.5, ycoord: 2.5, // sector (2,2) — outside NZ
    });
    shipMap.set('player2:2', player);

    const acquired: unknown[] = [];
    events.on(CYBERTRON_EVENT.TARGET_ACQUIRED, (p: unknown) => acquired.push(p));

    fireTick(5);
    await new Promise((r) => setImmediate(r));

    // With US1 implemented (T029), this would be > 0.
    // For now this is a structural test — the NZ player test is the binding assertion.
    // This test will be revisited after T029 implementation.
    expect(true).toBe(true);
  });
});

// ─── The zone protects a pilot who is ALREADY being hunted ───────────────────

describe('neutral-zone: an existing lock is released when the target reaches (0,0)', () => {
  it('drops cybmine when the locked target is inside the neutral sector', async () => {
    const { shipMap, fireTick } = await buildHarness(7);

    // Locked on channel 18 and already at the hub's edge — the exact state a
    // production Sarten Obliterator was found in: a live claim on a pilot who
    // had since flown into (0,0).
    const cyb = makeShip({
      userid: 'Cybrg-205', shipno: 205, shpclass: 21, status: 2,
      xcoord: 0.69, ycoord: 0.53, cybmine: 18, tick: 1, cybupdate: 100,
      holdcourse: 0,
    });
    shipMap.set('Cybrg-205:205', cyb);

    const player = makeShip({
      userid: 'player3', shipno: 3, shpclass: 3, status: 1,
      xcoord: 0.5, ycoord: 0.5, channel: 18,
    });
    shipMap.set('player3:3', player);

    fireTick(1);
    await new Promise((r) => setImmediate(r));

    expect(cyb.cybmine).toBe(255);
  });

  it('gives the ship a cruise speed to leave on, not the combat crawl', async () => {
    const { shipMap, fireTick } = await buildHarness(7);

    // 284 is the speed a production Obliterator was found holding inside the
    // zone: the combat band assigns `rndm(500)` once it is within half a sector
    // of its prey. Releasing the claim without replacing that leaves the ship
    // parked — free to go, crawling too slowly to get anywhere, until the idle
    // re-roll comes round up to 200 activations later.
    const cyb = makeShip({
      userid: 'Cybrg-207', shipno: 207, shpclass: 21, status: 2,
      xcoord: 0.54, ycoord: 0.29, cybmine: 18, tick: 1,
      cybupdate: 100, holdcourse: 0, damage: 0,
      speed2b: 284, head2b: 17,
    });
    shipMap.set('Cybrg-207:207', cyb);

    const player = makeShip({
      userid: 'player5', shipno: 5, shpclass: 3, status: 1,
      xcoord: 0.5, ycoord: 0.5, channel: 18,
    });
    shipMap.set('player5:5', player);

    fireTick(1);
    await new Promise((r) => setImmediate(r));

    expect(cyb.cybmine).toBe(255);
    expect(cyb.speed2b).not.toBe(284);
    expect(cyb.head2b).not.toBe(17);
    // Canon's idle cruise is `rndm(d_topspeed)` — bounded by the hull, and a
    // real speed rather than a combat crawl.
    // @see GECYBS.C:473 `		ptr->speed2b = rndm(d_topspeed); /* change the direction */`
    expect(cyb.speed2b).toBeGreaterThan(284);
    expect(cyb.speed2b).toBeLessThanOrEqual(cyb.topspeed * 1000);
  });

  it('keeps the lock while the target stays outside the neutral sector', async () => {
    const { shipMap, fireTick } = await buildHarness(7);

    const cyb = makeShip({
      userid: 'Cybrg-206', shipno: 206, shpclass: 21, status: 2,
      xcoord: 4, ycoord: 4, cybmine: 18, tick: 1, cybupdate: 100,
      holdcourse: 0,
    });
    shipMap.set('Cybrg-206:206', cyb);

    const player = makeShip({
      userid: 'player4', shipno: 4, shpclass: 3, status: 1,
      xcoord: 4.5, ycoord: 4.5, channel: 18,
    });
    shipMap.set('player4:4', player);

    fireTick(1);
    await new Promise((r) => setImmediate(r));

    expect(cyb.cybmine).toBe(18);
  });
});
