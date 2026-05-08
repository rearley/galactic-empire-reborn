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

function makeShip(overrides: Partial<ShipState> & { userid: string; shipno: number; shpclass: number }): ShipState {
  return {
    shipname: 'Test',
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5,
    damage: 0, energy: 50000, phasr: 100, phasrtype: 2, kills: 0, lastfired: 255,
    shieldtype: 2, shieldstat: 1, shield: 2, cloak: 0, degrees: 0, percent: 0,
    tactical: 0, helm: 1, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: 1, cybmine: 255, cybskill: 10, cybupdate: 50, tick: 1,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8000, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function buildSingleTrialHarness(seed: number) {
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
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  svc.onModuleInit();

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
const TRIAL_SEEDS = [
  1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
  1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020,
  2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
  2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
  3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010,
  3011, 3012, 3013, 3014, 3015, 3016, 3017, 3018, 3019, 3020,
  4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010,
  4011, 4012, 4013, 4014, 4015, 4016, 4017, 4018, 4019, 4020,
  5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010,
  5011, 5012, 5013, 5014, 5015, 5016, 5017, 5018, 5019, 5020,
];

// ─── T020a: acquisition-rate statistical test ──────────────────────────────────

describe('T020a (SC-002) — acquisition rate: ≥95 of 100 seeded trials end with cybmine set', () => {
  it('requires T029 cyb_check_lockon implementation to reach ≥95% — pre-impl stub passes trivially', () => {
    // Pre-implementation: cybmine stays 255 (cybLives is a stub), so 0 acquisitions.
    // Post-implementation: this test will enforce the ≥95% constraint.
    // The constraint itself is encoded here so the test will fail if T029 impl regresses.

    let acquisitions = 0;

    for (const seed of TRIAL_SEEDS) {
      const { shipMap, fireTick } = buildSingleTrialHarness(seed);

      // Cybertron outside NZ with tick=1
      const cyb = makeShip({
        userid: 'Cybrg-200', shipno: 200, shpclass: 21, status: 2,
        xcoord: 5.3, ycoord: 5.1, cybmine: 255, tick: 1, cybupdate: 100,
      });
      shipMap.set('Cybrg-200:200', cyb);

      // Player within scan range, class ≥ CYB_MINCLASS, outside NZ
      const player = makeShip({
        userid: 'player1', shipno: 1, shpclass: 3, status: 1,
        xcoord: 5.5, ycoord: 5.0,
      });
      shipMap.set('player1:1', player);

      fireTick(1); // exactly one Cybertron tick

      if (cyb.cybmine === 1) acquisitions++;
    }

    // T029 is implemented — assert ≥95 of 100 trials acquire the player (SC-002)
    expect(acquisitions).toBeGreaterThanOrEqual(95);
  });
});
