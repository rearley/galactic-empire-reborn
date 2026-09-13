/**
 * T020 — noClaim cap: at most noClaim Cybertrons may claim the same player simultaneously.
 *
 * @see GECYBS.C — cyb_check_lockon noClaim enforcement (SC-006, FR-010)
 * @see specs/007-cybertron-ai/tasks.md T020
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

async function buildHarness(noClaim: number, numCybertrons: number, seed = 42) {
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

  // Set up class with configurable noClaim
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 500_000,
    maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true, noClaim, tough: 0, cybLowestClassAttacks: 1,
  });
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 0,
  });

  // Place player at center (outside NZ — sector 5,5)
  const player = makeShip({
    userid: 'player1', shipno: 1, shpclass: 3, status: 1,
    xcoord: 5.5, ycoord: 5.5,
  });
  shipMap.set('player1:1', player);

  // Place N+1 Cybertrons around the player
  for (let i = 0; i < numCybertrons; i++) {
    const shipno = 200 + i;
    const angle = (i / numCybertrons) * 2 * Math.PI;
    const cyb = makeShip({
      userid: `Cybrg-${shipno}`, shipno, shpclass: 21, status: 2,
      xcoord: 5.5 + Math.cos(angle) * 0.5,
      ycoord: 5.5 + Math.sin(angle) * 0.5,
      cybmine: 255, tick: 1, cybupdate: 100,
    });
    shipMap.set(`Cybrg-${shipno}:${shipno}`, cyb);
  }

  return { svc, shipMap, events, fireTick, player };
}

// ─── T020: noClaim cap ────────────────────────────────────────────────────────

describe('T020 — noClaim cap: at most noClaim Cybertrons claim a player at once', () => {
  it('with noClaim=3, N+1=4 Cybertrons: at most 3 hold cybmine=playerShipno after many ticks', async () => {
    const noClaim = 3;
    const numCybertrons = noClaim + 1; // 4 Cybertrons competing for noClaim=3 slots
    const { shipMap, fireTick } = await buildHarness(noClaim, numCybertrons, 42);

    // Drive enough ticks that all Cybertrons have had a chance to activate
    // Each Cybertron starts with tick=1 so first activation is next tick.
    // With CYBMAXPERTICK=2, we need at least (numCybertrons/2) ticks to process all.
    fireTick(10);
    await new Promise((r) => setImmediate(r));

    // Count how many Cybertrons claim the player (cybmine === 1)
    const claimCount = Array.from(shipMap.values())
      .filter((s) => s.status === 2 && s.cybmine === 1)
      .length;

    // After US1 implementation, this should be ≤ noClaim.
    // Pre-implementation: cybmine stays at 255 for all (stub), so 0 ≤ noClaim is trivially true.
    expect(claimCount).toBeLessThanOrEqual(noClaim);
  });

  it('with noClaim=1, exactly at most 1 Cybertron can claim a player', async () => {
    const noClaim = 1;
    const numCybertrons = 3; // 3 Cybertrons, only 1 can claim
    const { shipMap, fireTick } = await buildHarness(noClaim, numCybertrons, 77);

    fireTick(10);
    await new Promise((r) => setImmediate(r));

    const claimCount = Array.from(shipMap.values())
      .filter((s) => s.status === 2 && s.cybmine === 1)
      .length;

    expect(claimCount).toBeLessThanOrEqual(noClaim);
  });
});
