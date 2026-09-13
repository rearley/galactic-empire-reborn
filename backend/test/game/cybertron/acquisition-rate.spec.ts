/**
 * T020a — SC-002 statistical: Cybertron acquires nearby player in ≥95 of 100 seeded trials.
 *
 * @see GECYBS.C — cyb_check_lockon (SC-002)
 * @see specs/007-cybertron-ai/tasks.md T020a
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
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and
    // victim by giving each a distinct shipno, so mirror it into channel.
    channel: overrides.channel ?? overrides.shipno ?? 1,
    ...overrides,
  });
}

async function buildSingleTrialHarness(seed: number) {
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
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  await svc.onModuleInit();

  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(21, {
    maxAcceleration: 2000, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 500_000,
    maxTons: 900, hasTorpedo: true, hasMissile: false,
    hasJammer: true, hasMine: true, hasZipper: true, noClaim: 3, tough: 0, cybLowestClassAttacks: 1,
  });
  (shipClassCache as unknown as { setClass: (n: number, e: unknown) => void }).setClass(3, {
    maxAcceleration: 1000, maxWarp: 5, maxPhaser: 1, maxShields: 1,
    scanRange: 30_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, noClaim: 3, tough: 0, cybLowestClassAttacks: 0,
  });

  function fireTick(n = 1): void {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) {
        fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
      }
    }
  }

  return { shipMap, fireTick };
}

// Seed list — checked into test for reproducibility (SC-002)
// ─── T020a: acquisition-rate statistical test ──────────────────────────────────

/**
 * SC-002: a Cybertron in range of an eligible player acquires it at least 95%
 * of the time.
 *
 * Measured over 10 000 seeds: **95.18%**, and every single miss has the same
 * cause — `holdcourse` was set earlier in the SAME activation, so
 * `cyb_check_lockon` returns before it scans. That is canon's own structure:
 * GECYBS.C:672 checks `holdcourse` first, and `cyb_check_damage` and the jammed
 * branch above it are what set it. A Cybertron that just took evasive action
 * does not also acquire on that pass; it acquires on the next one.
 *
 * The sample size is the whole story of this file. At p ≈ 0.952 the standard
 * error over 1 000 trials is 0.68 points, so a 1 000-seed window lands anywhere
 * from about 93.8% to 96.5% by luck alone — and the window seeded 1000..1999
 * measures 93.9%, which read as a criterion failure when the harness started
 * awaiting `onModuleInit` and shifted the draw sequence (issue #28). Nothing
 * about the AI changed. Sampling wide measures the property the criterion
 * states; sampling narrow measures the PRNG.
 *
 * @see issue #38 — filed when the narrow sample read 93.9%, closed by this
 *   measurement.
 */
describe('T020a (SC-002) — acquisition rate over a wide seed sample', () => {
  const TRIALS = 10_000;
  /**
   * Measured 95.18% over these seeds. The floor sits at the criterion itself
   * rather than below it, because 10 000 trials put the standard error at 0.21
   * points and there is no longer any need for slack to absorb noise.
   */
  const MIN_RATE = 0.95;

  /** One trial: a fresh harness, a Cybertron with no target, one player in range. */
  async function trial(seed: number): Promise<ShipState> {
    const { shipMap, fireTick } = await buildSingleTrialHarness(seed);

    // Cybertron outside NZ with tick=1
    const cyb = makeShip({
      userid: 'Cybrg-200', shipno: 200, shpclass: 21, status: 2,
      xcoord: 5.3, ycoord: 5.1, cybmine: 255, tick: 1, cybupdate: 100,
    });
    shipMap.set('Cybrg-200:200', cyb);

    // Player within scan range, class >= CYB_MINCLASS, outside NZ
    shipMap.set('player1:1', makeShip({
      userid: 'player1', shipno: 1, shpclass: 3, status: 1,
      xcoord: 5.5, ycoord: 5.0,
    }));

    fireTick(1); // exactly one Cybertron tick
    return cyb;
  }

  it('acquires an in-range player in at least 95% of trials', async () => {
    let acquisitions = 0;
    for (let i = 0; i < TRIALS; i++) {
      if ((await trial(1000 + i)).cybmine === 1) acquisitions++;
    }

    expect(acquisitions / TRIALS).toBeGreaterThanOrEqual(MIN_RATE);
  }, 120_000);

  /**
   * The stronger statement, and the one a rate cannot make: there is no OTHER
   * way to miss. If a scan-loop gate ever starts rejecting an eligible target —
   * a claim count, a neutral-zone test, a class bound — this fails even while
   * the rate stays inside its margin, because the reason will not be holdcourse.
   */
  it('misses only ever because holdcourse was set earlier in the same activation', async () => {
    const otherReasons: string[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const cyb = await trial(1000 + i);
      if (cyb.cybmine === 1) continue;
      if (cyb.holdcourse > 0) continue;
      otherReasons.push(`seed ${1000 + i}: cybmine=${cyb.cybmine} holdcourse=${cyb.holdcourse}`);
    }

    expect(otherReasons).toEqual([]);
  }, 120_000);
});
