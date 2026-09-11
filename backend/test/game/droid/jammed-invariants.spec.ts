/**
 * T036 (SC-006) — A jammed Droid emits zero droid.annoy events and fires zero
 * weapons across 100 cadence rollovers. Only speed2b and holdcourse change.
 *
 * @see GEDROIDS.C:285-288 jammed scow: sub-warp flee + hold, no annoy
 * @see GEDROIDS.C:396-400 jammed Murdonian: flee, return early
 * @see specs/008-droid-ai/tasks.md T036
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { DroidEvents } from '../../../src/game/droid/droid-events';
import { COMBAT_HIT } from '../../../src/game/combat/combat-events';
import {
  DROID_CLASS_SCOW,
  DROID_USERID_PREFIX,
  DROID_SPAWN_TICK_CADENCE,
  GESTAT_USER,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'test', shipno: 1, shipname: 'Test', shpclass: 31,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 1, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 2, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 6, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 1, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    isEphemeral: true,
    ...overrides,
  };
}

const SCOW_CLASS_ENTRY: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 1, maxPhaser: 1, maxShields: 1,
  scanRange: 25_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', category: 'CPU_DROID', shipNameTemplate: '',
};

// ─── Harness ──────────────────────────────────────────────────────────────────

function buildJammedHarness(seed = 42) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const droidUserid = `${DROID_USERID_PREFIX}1`;

  // A jammed Scow
  const jammingDroid = makeShip({
    userid: droidUserid,
    shipno: 1,
    shpclass: DROID_CLASS_SCOW,
    xcoord: 0,
    ycoord: 0,
    jammer: 999, // persistent high jammer value — won't drop to 0 during test
    speed: 0,
    status: 2,
    isEphemeral: true,
  });

  // A player in scan range
  const player = makeShip({
    userid: 'player1',
    shipno: 1,
    xcoord: 0.5,
    ycoord: 0,
    status: GESTAT_USER,
    isEphemeral: undefined,
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${droidUserid}:1`, jammingDroid);
  shipMap.set('player1:1', player);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (uid: string, no: number) => shipMap.get(`${uid}:${no}`),
    mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${uid}:${no}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: (s: { userid: string; shipno: number }) =>
      shipMap.delete(`${s.userid}:${s.shipno}`),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: (_n: number): ShipClassEntry => SCOW_CLASS_ENTRY,
    getMaxPhaser: (_n: number) => 1,
    getMaxTons: (_n: number) => 100,
    getMaxShields: (_n: number) => 1,
  } as unknown as ShipClassCacheService;

  const mineRegistry = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
  const mineRepo = {
    create: jest.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }),
  } as unknown as MineRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
      subscribed.push(fn);
      return () => {};
    },
  } as unknown as TickService;

  const spawner = new DroidSpawner(shipState, classCache, rand);
  const svc = new DroidTickService(
    tickService, shipState, classCache, spawner, mineRegistry, mineRepo, events, rand,
  );
  void svc.onModuleInit();

  // Pre-populate livePopulation
  svc.getLivePopulation().get(DROID_CLASS_SCOW)!.add(droidUserid);

  async function fireNRollovers(n: number): Promise<void> {
    const totalTicks = n * DROID_SPAWN_TICK_CADENCE;
    for (let i = 1; i <= totalTicks; i++) {
      for (const fn of subscribed) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { svc, events, droidUserid, jammingDroid, fireNRollovers };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T036 (SC-006) — jammed Droid invariants: zero annoy events, zero weapon fire', () => {
  it('emits zero droid.annoy events across 100 cadence rollovers', async () => {
    const { events, fireNRollovers } = buildJammedHarness(42);

    const annoyEvents: unknown[] = [];
    events.on(DroidEvents.ANNOY, (e: unknown) => annoyEvents.push(e));

    await fireNRollovers(100);

    expect(annoyEvents).toHaveLength(0);
  });

  it('emits zero combat.hit events across 100 cadence rollovers (no weapon fire)', async () => {
    const { events, fireNRollovers } = buildJammedHarness(42);

    const hitEvents: unknown[] = [];
    events.on(COMBAT_HIT, (e: unknown) => hitEvents.push(e));

    await fireNRollovers(100);

    expect(hitEvents).toHaveLength(0);
  });

  it('Droid state has dirty=true after 1 cadence rollover (actOnDroid sets dirty)', async () => {
    const { jammingDroid, fireNRollovers } = buildJammedHarness(42);

    await fireNRollovers(1);

    // actOnDroid always sets dirty=true at the end, even for jammed droids
    expect(jammingDroid.dirty).toBe(true);
  });

  it('Droid energy is reset to 50000 after each cadence rollover', async () => {
    const { jammingDroid, fireNRollovers } = buildJammedHarness(42);

    jammingDroid.energy = 10;
    await fireNRollovers(1);

    // actOnDroid resets energy to 50000 @see GEDROIDS.C:214
    expect(jammingDroid.energy).toBe(50_000);
  });

  it('Droid jammer value is unchanged by actOnDroid (jammer tick is outside droid AI loop)', async () => {
    const { jammingDroid, fireNRollovers } = buildJammedHarness(42);

    const initialJammer = jammingDroid.jammer;
    await fireNRollovers(1);

    // The droid AI does not decrement jammer itself — that is handled by the physics tick
    expect(jammingDroid.jammer).toBe(initialJammer);
  });

  it('speed2b changes when jammed (Scow sets jammedSpeed=999.9 on jammed branch)', async () => {
    const { jammingDroid, fireNRollovers } = buildJammedHarness(42);

    jammingDroid.speed2b = 0;
    await fireNRollovers(1);

    // @see GEDROIDS.C:287 — jammed Scow sets speed2b = 999.9
    expect(jammingDroid.speed2b).toBe(999.9);
  });

  it('holdcourse is set (jammed Scow sets holdcourse ∈ [10, 59])', async () => {
    const { jammingDroid, fireNRollovers } = buildJammedHarness(42);

    jammingDroid.holdcourse = 0;
    await fireNRollovers(1);

    expect(jammingDroid.holdcourse).toBeGreaterThanOrEqual(10);
    expect(jammingDroid.holdcourse).toBeLessThanOrEqual(59);
  });
});
