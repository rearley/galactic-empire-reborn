/**
 * A-003: gebemean gate on Cybertron phaser fire.
 *
 * Before this fix, `cybAttack` gated phaser fire only on `!cybwhoops` —
 * matching neither GECYBS.C:514's `gebemean(...)` condition nor the
 * `phasr >= PMINFIRE` check. This suite verifies the corrected gate:
 *   `ship.phasr >= PMINFIRE && gebemean(...) && !cybwhoops(...)`.
 *
 * gebemean is evaluated exactly once per cybAttack call and reused for
 * the torpedo-count roll — no double PRNG consumption.
 *
 * @see GECYBS.C:514-519 cyb_attack phaser gate
 * @see specs/024-ai-presence/plan.md Plan 2 T2 (A-003)
 */

import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState } from '../../../src/game/ship/ship-state.types';

// ─── helpers (mirrors cybertron-tick.service.spec.ts harness) ────────────────

function makeShip(
  overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number },
): ShipState {
  return {
    shipname: 'Test',
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 2, kills: 0, lastfired: 255,
    shieldtype: 2, shieldstat: 1, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0,
    destruct: 0, status: 1, cybmine: 255, cybskill: 10, cybupdate: 50, tick: 1,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false, dirty: false,
    ...overrides,
  };
}

function buildHarness(seed: number) {
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
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn().mockResolvedValue(undefined),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => (n > 2_000_000n ? 2_000_000n : n),
  } as unknown as CybertronRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  svc.onModuleInit();

  function fireTick(n = 1): void {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
      }
    }
  }

  // Class 21: Cybertron Scout — tough=0 (not a Cyberquad), so gebemean depends on PRNG
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 50_000, maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true, noClaim: 3, tough: 0,
    cybLowestClassAttacks: 1,
  });
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0,
    cybLowestClassAttacks: 0,
  });

  return { svc, shipMap, events, fireTick };
}

// ─── PRNG seed analysis (Mulberry32) ─────────────────────────────────────────
//
// These two tests pin the gebemean gate by choosing a seed whose draw sequence
// lands on either side of it. The draw ORDER through the engagement scan is not
// stable across fidelity fixes — the break-off roll is now short-circuited away
// for non-quad classes (GECYBS.C:255 `isquad`), and cyb_attack consumes further
// draws for the evasion block (GECYBS.C:541-585) — so the seeds below were
// re-derived by search rather than by hand-tracing, and will need re-deriving
// again if the order changes. What is asserted is the behaviour, not the seed:
// with gebemean false the phaser must not fire and phasr must not drain.

const COMBAT_PHASER_FIRED = 'combat.phaser-fired';

// ─── A-003-1: gebemean=false blocks phaser fire ───────────────────────────────

describe('A-003 — gebemean gate: GECYBS.C:514 phaser blocked when gebemean returns false', () => {
  it('does NOT fire phasers when gebemean is false even though phasr is charged and cybwhoops is false', async () => {
    /**
     * seed=1 with kills=0 (≤ CYB_BE_NICE=30, tough=0 for class 21):
     *   - breakoff roll (r1=0.627): floor(0.627*500)=313 ≠ 0 → no breakoff
     *   - rangeFactor (r2): cantexit=1 makes canAttack=true regardless
     *   - gebemean (r3=0.527): floor(0.527*3)=1 ≠ 0 → false
     * Result: mean=false → phaser gate blocks fire even though phasr=100 >= PMINFIRE=60
     */
    const { shipMap, events, fireTick } = buildHarness(5);

    const cyb = makeShip({
      userid: 'Cybrg-200', shipno: 200, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 1, tick: 1, cybupdate: 100, holdcourse: 0,
      where: 0, phasr: 100,
    });
    shipMap.set('Cybrg-200:200', cyb);

    // Player at close range, kills=0 (≤ CYB_BE_NICE=30), cantexit=1 (forces attack path)
    const player = makeShip({
      userid: 'player1', shipno: 1, shpclass: 3, status: 1,
      xcoord: 7, ycoord: 5, // 2 units away — combat band (≤ 3.0)
      kills: 0, cantexit: 1,
    });
    shipMap.set('player1:1', player);

    const phaserFired: unknown[] = [];
    events.on(COMBAT_PHASER_FIRED, (e: unknown) => phaserFired.push(e));

    const initialPhasr = cyb.phasr;
    fireTick(1);
    await new Promise((r) => setImmediate(r));

    // gebemean=false with seed=1 → phaser gate blocked
    expect(phaserFired).toHaveLength(0);
    expect(cyb.phasr).toBe(initialPhasr); // phasr unchanged (no fire, no drain)
  });
});

// ─── A-003-2: gebemean=true (deterministic via kills > CYB_BE_NICE) allows fire ──

describe('A-003 — gebemean gate: phaser fires when gebemean is true and cybwhoops is false', () => {
  it('emits COMBAT_PHASER_FIRED when kills > CYB_BE_NICE (gebemean deterministically true)', async () => {
    /**
     * kills=50 > CYB_BE_NICE=30:
     *   gebemean short-circuits to true without consuming PRNG.
     * seed=42: breakoff=false, cybwhoops r3=0.852 → floor(0.852*10)=8 ≠ 1 → whoops=false.
     * Result: mean=true, !cybwhoops=true, phasr=100 >= PMINFIRE=60 → phaser fires.
     */
    const { shipMap, events, fireTick } = buildHarness(42);

    const cyb = makeShip({
      userid: 'Cybrg-200', shipno: 200, shpclass: 21, status: 2,
      xcoord: 5, ycoord: 5, cybmine: 1, tick: 1, cybupdate: 100, holdcourse: 0,
      where: 0, phasr: 100,
    });
    shipMap.set('Cybrg-200:200', cyb);

    // Player at close range with kills > CYB_BE_NICE → gebemean always true
    const player = makeShip({
      userid: 'player1', shipno: 1, shpclass: 3, status: 1,
      xcoord: 7, ycoord: 5, // 2 units away — combat band (≤ 3.0)
      kills: 50, cantexit: 1, // kills > CYB_BE_NICE=30 → gebemean deterministic
    });
    shipMap.set('player1:1', player);

    const phaserFired: unknown[] = [];
    events.on(COMBAT_PHASER_FIRED, (e: unknown) => phaserFired.push(e));

    fireTick(1);
    await new Promise((r) => setImmediate(r));

    expect(phaserFired.length).toBeGreaterThan(0);
  });
});
