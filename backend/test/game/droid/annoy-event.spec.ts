/**
 * T017 — Annoy event integration: Droid in scan range emits droid.annoy
 * with the expected payload shape when the annoy roll succeeds.
 *
 * Uses a Lydorian Garbage Scow (class 31) whose decision tree is the simplest:
 * it calls rollAnnoy exactly once per in-range player, with no other RNG-consuming
 * branches that could vary based on spawn state. Population is pre-filled to cap
 * so no spawn RNG draws happen during the cadence rollover under test.
 *
 * @see GEDROIDS.C:237 droid_annoy — if ((gernd()%rnd) == 1)
 * @see GEDROIDS.C:253-298 droid_act_class_10
 * @see specs/008-droid-ai/tasks.md T017
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { DROID_CLASS_DEFAULTS } from '../../../src/game/droid/droid.config';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { DroidEvents } from '../../../src/game/droid/droid-events';
import type { DroidAnnoyEvent } from '../../../src/game/droid/droid-events';
import {
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  DROID_SPAWN_TICK_CADENCE,
  GESTAT_USER,
} from '../../../src/game/constants';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';

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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    isEphemeral: true,
    ...overrides,
  };
}

const SCOW_CLASS_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 1, maxPhaser: 1, maxShields: 1,
  scanRange: 25_000, maxTons: 100, hasTorpedo: false, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false, noClaim: 0,
  tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100, typeName: 'Droid', shipNameTemplate: '',
};

// ─── Harness builder ──────────────────────────────────────────────────────────

/**
 * Build a harness where one Garbage Scow (class 31) is in scan range of one player.
 * All three classes are pre-filled to cap (2 each = 6 total) so no spawn evaluation
 * runs during the test cadence, meaning the only RNG draws come from actClass10.
 *
 * rollAnnoy succeeds when: Math.floor(rng.next() * 4) === 1
 * For seed=12: first rng.next() ≈ 0.288 → floor(0.288 * 4) = 1 → succeeds.
 */
function buildHarness(seed = 12) {
  const rand = new Mulberry32Adapter(seed);
  const events = new EventEmitter2();

  const droidUserid = `${DROID_USERID_PREFIX}1`;

  const scow = makeShip({
    userid: droidUserid,
    shipno: 1,
    shipname: 'LydorianGarbageScow1',
    shpclass: DROID_CLASS_SCOW,
    // Out of the neutral zone so runDroidActions doesn't filter the player out.
    xcoord: 10,
    ycoord: 7,
    jammer: 0,
    cantexit: 0,
    speed: 0,
    status: 2, // GESTAT_AUTO
    isEphemeral: true,
  });

  const player = makeShip({
    userid: 'player1',
    shipno: 1,
    shipname: 'PlayerShip',
    shpclass: 5,
    // Adjacent to the scow, out of the neutral zone so the runDroidActions
    // player-filter (skips floor(x)===0 && floor(y)===0) keeps this player.
    // The offset is a FRACTION of the scow's own scanRange — the annoy check is
    // gated on it, so a hardcoded gap silently stops exercising this path
    // whenever the class is retuned. scanRange lives in the ShipClass table.
    xcoord: 10 + (SHIP_CLASSES.find((c) => c.classNumber === DROID_CLASS_SCOW)!.scanRange / 10_000) * 0.5,
    ycoord: 7,
    status: GESTAT_USER,
    isEphemeral: undefined,
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${droidUserid}:1`, scow);
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

  // Pre-fill ALL classes to cap=2 so no spawn evaluation runs during the cadence rollover.
  // This ensures the only RNG draws during actOnDroid come from actClass10 itself.
  const pop = svc.getLivePopulation();
  pop.get(DROID_CLASS_SCOW)!.add(droidUserid);
  pop.get(DROID_CLASS_SCOW)!.add(`${DROID_USERID_PREFIX}99`); // dummy second scow at cap
  pop.get(DROID_CLASS_TRANSPORT)!.add(`${DROID_USERID_PREFIX}100`);
  pop.get(DROID_CLASS_TRANSPORT)!.add(`${DROID_USERID_PREFIX}101`);
  pop.get(DROID_CLASS_VAKORY)!.add(`${DROID_USERID_PREFIX}102`);
  pop.get(DROID_CLASS_VAKORY)!.add(`${DROID_USERID_PREFIX}103`);

  async function fireOneCadenceRollover(): Promise<void> {
    // Drive the counter from 0 → CADENCE so it triggers at tick CADENCE
    for (let i = 1; i <= DROID_SPAWN_TICK_CADENCE; i++) {
      for (const fn of subscribed) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  return { svc, events, droidUserid, scow, player, fireOneCadenceRollover };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T017 — droid.annoy event integration', () => {
  it('emits at least one droid.annoy when Murdonian is in scan range and annoy roll succeeds', async () => {
    // Use a seed known to succeed on first rollAnnoy(4, rng) call
    // seed 12 → first rng.next() ≈ 0.288 → floor(0.288 * 4) = 1 → true
    const { events, fireOneCadenceRollover } = buildHarness(12);

    const annoyEvents: DroidAnnoyEvent[] = [];
    events.on(DroidEvents.ANNOY, (e: DroidAnnoyEvent) => annoyEvents.push(e));

    await fireOneCadenceRollover();

    expect(annoyEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('droid.annoy payload has required fields: fromShipKey, fromShipname, toUserid, toShipno, message, sector, tickAt', async () => {
    const { events, fireOneCadenceRollover, droidUserid } = buildHarness(12);

    const annoyEvents: DroidAnnoyEvent[] = [];
    events.on(DroidEvents.ANNOY, (e: DroidAnnoyEvent) => annoyEvents.push(e));

    await fireOneCadenceRollover();

    // Find the first annoy targeting the player
    const evt = annoyEvents.find((e) => e.toUserid === 'player1');
    expect(evt).toBeDefined();
    if (!evt) return;

    expect(evt.fromShipKey).toBe(`${droidUserid}:1`);
    expect(evt.fromShipname).toBe('LydorianGarbageScow1');
    expect(evt.toUserid).toBe('player1');
    expect(evt.toShipno).toBe(1);
    expect(typeof evt.message).toBe('string');
    expect(evt.message.length).toBeGreaterThan(0);
    expect(typeof evt.sector).toBe('object');
    expect(typeof evt.sector.x).toBe('number');
    expect(typeof evt.sector.y).toBe('number');
    expect(typeof evt.tickAt).toBe('number');
  });

  it('droid.annoy payload classNumber === 31 (DROID_CLASS_SCOW)', async () => {
    const { events, fireOneCadenceRollover } = buildHarness(12);

    const annoyEvents: DroidAnnoyEvent[] = [];
    events.on(DroidEvents.ANNOY, (e: DroidAnnoyEvent) => annoyEvents.push(e));

    await fireOneCadenceRollover();

    const evt = annoyEvents.find((e) => e.toUserid === 'player1');
    expect(evt).toBeDefined();
    expect(evt!.classNumber).toBe(DROID_CLASS_SCOW);
  });

  it("droid.annoy payload variant === 'passive' for scan-range annoy", async () => {
    const { events, fireOneCadenceRollover } = buildHarness(12);

    const annoyEvents: DroidAnnoyEvent[] = [];
    events.on(DroidEvents.ANNOY, (e: DroidAnnoyEvent) => annoyEvents.push(e));

    await fireOneCadenceRollover();

    const evt = annoyEvents.find((e) => e.toUserid === 'player1' && e.variant === 'passive');
    expect(evt).toBeDefined();
    expect(evt!.variant).toBe('passive');
  });

  it('no droid.annoy emitted when Scow is jammed', async () => {
    // Build a fresh harness where the Scow starts with jammer > 0
    // All classes pre-filled to cap so no spawn RNG draws interfere.
    const rand2 = new Mulberry32Adapter(12);
    const events2 = new EventEmitter2();
    const droidUserid2 = `${DROID_USERID_PREFIX}1`;
    const jammedScow = makeShip({
      userid: droidUserid2,
      shipno: 1,
      shpclass: DROID_CLASS_SCOW,
      xcoord: 0,
      ycoord: 0,
      jammer: 5, // jammed
      status: 2,
      isEphemeral: true,
    });
    const player2 = makeShip({
      userid: 'player2', shipno: 1, xcoord: 0.5, ycoord: 0, status: GESTAT_USER, isEphemeral: undefined,
    });

    const shipMap2 = new Map<string, ShipState>();
    shipMap2.set(`${droidUserid2}:1`, jammedScow);
    shipMap2.set('player2:1', player2);

    const shipState2 = {
      findAllShips: () => Array.from(shipMap2.values()),
      get: (uid: string, no: number) => shipMap2.get(`${uid}:${no}`),
      mutate: (uid: string, no: number, fn: (s: ShipState) => void) => {
        const s = shipMap2.get(`${uid}:${no}`);
        if (s) { fn(s); s.dirty = true; }
        return s;
      },
      loadShip: (s: ShipState) => shipMap2.set(`${s.userid}:${s.shipno}`, s),
      removeFromGame: (s: { userid: string; shipno: number }) => shipMap2.delete(`${s.userid}:${s.shipno}`),
      size: () => shipMap2.size,
      findByUserid: () => [],
    } as unknown as ShipStateService;

    const classCache2 = {
      get: (_n: number): ShipClassEntry => SCOW_CLASS_ENTRY,
      getMaxPhaser: () => 1,
      getMaxTons: () => 100,
      getMaxShields: () => 1,
    } as unknown as ShipClassCacheService;

    const mineRegistry2 = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
    const mineRepo2 = { create: jest.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }) } as unknown as MineRepository;

    const subscribed2: Array<(ctx: unknown) => void> = [];
    const tickService2 = {
      subscribe: (_kind: unknown, fn: (ctx: unknown) => void) => {
        subscribed2.push(fn);
        return () => {};
      },
    } as unknown as TickService;

    const spawner2 = new DroidSpawner(shipState2, classCache2, rand2);
    const svc2 = new DroidTickService(
      tickService2, shipState2, classCache2, spawner2, mineRegistry2, mineRepo2, events2, rand2,
    );
    void svc2.onModuleInit();

    // Pre-fill all classes to cap so spawning is skipped
    const pop2 = svc2.getLivePopulation();
    pop2.get(DROID_CLASS_SCOW)!.add(droidUserid2);
    pop2.get(DROID_CLASS_SCOW)!.add(`${DROID_USERID_PREFIX}99`);
    pop2.get(DROID_CLASS_TRANSPORT)!.add(`${DROID_USERID_PREFIX}100`);
    pop2.get(DROID_CLASS_TRANSPORT)!.add(`${DROID_USERID_PREFIX}101`);
    pop2.get(DROID_CLASS_VAKORY)!.add(`${DROID_USERID_PREFIX}102`);
    pop2.get(DROID_CLASS_VAKORY)!.add(`${DROID_USERID_PREFIX}103`);

    const annoyEvents2: DroidAnnoyEvent[] = [];
    events2.on(DroidEvents.ANNOY, (e: DroidAnnoyEvent) => annoyEvents2.push(e));

    for (let i = 1; i <= DROID_SPAWN_TICK_CADENCE; i++) {
      for (const fn of subscribed2) {
        fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
      }
      await new Promise((r) => setImmediate(r));
    }

    // Jammed Scow: no passive annoys emitted (jammed branch returns early with empty annoys)
    const passiveFromJammed = annoyEvents2.filter(
      (e) => e.fromShipKey === `${droidUserid2}:1` && e.variant === 'passive',
    );
    expect(passiveFromJammed).toHaveLength(0);
  });
});
