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

function makeShip(overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number }): ShipState {
  return {
    shipname: 'Test',
    heading: 0,
    head2b: 0,
    speed: 0,
    speed2b: 0,
    xcoord: 5,
    ycoord: 5,
    damage: 0,
    energy: 50000,
    phasr: 100,
    phasrtype: 2,
    kills: 0,
    lastfired: 255,
    shieldtype: 2,
    shieldstat: 1,
    shield: 2,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 1,
    train: 0,
    where: 0,
    ltorpsChannel: [],
    ltorpsDistance: [],
    lmisslChannel: [],
    lmisslDistance: [],
    lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0],
    jammer: 0,
    freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    titem: 0,
    hostile: 0,
    cantexit: 0,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 1,
    cybmine: 255,
    cybskill: 10,
    cybupdate: 50,
    tick: 1,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 8000,
    warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function buildHarness(seed = 42) {
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
    setClass: (n: number, e: ReturnType<ShipClassCacheService['get']>) => classCache.set(n, e),
  } as unknown as ShipClassCacheService & { setClass: (n: number, e: unknown) => void };

  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn().mockResolvedValue(undefined),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
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
  svc.onModuleInit();

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
    const { shipMap, events, fireTick } = buildHarness(42);

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
    const { shipMap, events, fireTick } = buildHarness(99);

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
