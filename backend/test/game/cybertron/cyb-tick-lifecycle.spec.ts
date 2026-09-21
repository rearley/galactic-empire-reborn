/**
 * The Cybertron LIFECYCLE decisions — the parts of `cyb_lives` that run before
 * and after the engagement scan, plus the birth of the hull itself.
 *
 * cyb-tick-decisions.spec.ts covers the engagement scan and the acquisition
 * filters. This file covers what remains, and every case here is a decision a
 * player meets in play:
 *
 *  - **`db_update`'s idle wander** (GECYBS.C:455-478). A Cybertron with no
 *    claim re-rolls its course every ~150 activations; one that HAS a claim
 *    must not, or it wanders off mid-pursuit and the galaxy is populated by
 *    hostiles that never arrive. The `cybupdate == 1` gate is also the only
 *    thing that stops the re-roll happening on every single activation.
 *  - **`cyb_check_damage`** (GECYBS.C:619-643). The three-part gate — a claim,
 *    damage past CYB_MINDAM, and a 1-in-10 roll — decides whether a wounded
 *    Cybertron scrambles its heading, drops a mine in your path and burns a
 *    jammer. Widen it and every scratched Cybertron mines the sector; drop it
 *    and a Cybertron under fire flies straight and never mines at all.
 *  - **The band's instantaneous speed clamp** (GECYBS.C:756-761,
 *    `if (ptr->speed > 20000.0) ptr->speed = 20000.0`). `pickPursuitBand`
 *    RETURNS the clamp; pursuit-and-breakoff.spec.ts pins the returned field.
 *    Nothing until now went through the caller that applies it, which is
 *    exactly the gap docs/TEST_STRATEGY.md names ("test the caller's
 *    arithmetic, not the function's"). Without the clamp a Cybertron dropping
 *    out of hyperwarp keeps its hyperwarp speed and overshoots forever; with
 *    it applied unconditionally, a slow one ACCELERATES to 20,000 while
 *    braking.
 *  - **Spawn bookkeeping.** `tot_to_create` is the population cap, and the
 *    ship-number scan is what stops a new Cybertron overwriting a living one.
 *    Coordinates come from `random * UNIVMAX * 2 - UNIVMAX`, so a Cybertron
 *    born outside the galaxy — or only ever in its positive quadrant — is a
 *    one-character change away.
 *  - **`cyb_won`** (GECYBS.C). After a kill the claim is released and the
 *    hull settles to warp 2. Reached here through the real emitter path,
 *    CYBERTRON_SCORED_KILL, the way PlayerScoreService raises it.
 *
 * Randomness is fixed, never seeded, so each case names the draw it depends
 * on. Where one case needs two different draws it uses an explicit sequence
 * and states the order.
 *
 * @see GECYBS.C:198 cyb_lives, :455 db_update, :619 cyb_check_damage,
 *      :738-803 the pursuit ladder, cyb_won
 * @see docs/TEST_STRATEGY.md — the filter, and "test the caller's arithmetic"
 */

import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_MINE, I_JAMMER } from '../../../src/game/constants/items';
import { CYB_MINDAM, FIRETICKS, GESTAT_AUTO, UNIVMAX } from '../../../src/game/constants';
import type { CybertronClassConfig } from '../../../src/game/cybertron/cybertron.config';
import {
  CYBERTRON_SCORED_KILL,
  CybertronScoredKillEvent,
} from '../../../src/game/player/player-score.service';
import { CYB_WON_SPEED } from '../../../src/game/cybertron/cyb-transitions';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const CLASS_INTERCEPTOR = 1;
const CLASS_SCOUT = 21;

/** `cybLives` derives its speed argument as `topspeed * 1000`. */
const TOPSPEED_WARP = 8;
const TOP_SPEED = TOPSPEED_WARP * 1000;

/** Class scanRange 100_000 raw units = 10 sectors. Every "far" pair here is beyond it. */
const SCAN_RANGE = 100_000;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'S',
    shpclass: CLASS_INTERCEPTOR,
    xcoord: 20,
    ycoord: 20,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    items: Array.from({ length: NUMITEMS }, () => 0n),
    cybmine: 255,
    cybskill: 5,
    topspeed: TOPSPEED_WARP,
    userKills: 0,
    ...over,
  });
}

function player(channel: number, over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: `p${channel}`, shipno: channel, channel, shipname: `Player${channel}`,
    shpclass: CLASS_INTERCEPTOR, status: 1, ...over,
  } as Partial<ShipState>);
}

function cybertron(over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: 'Cybrg-201', shipno: 201, channel: 201, shipname: 'Cybertron 1',
    shpclass: CLASS_SCOUT, status: GESTAT_AUTO, heading: 0, topspeed: TOPSPEED_WARP,
    ...over,
  } as Partial<ShipState>);
}

function classEntry(over: Partial<ShipClassEntry>): ShipClassEntry {
  return {
    maxAcceleration: 1200, maxWarp: TOPSPEED_WARP, maxPhaser: 2, maxShields: 2,
    scanRange: SCAN_RANGE, maxTons: 900, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100,
    typeName: 'harness', category: 'CPU_COMBATIVE', shipNameTemplate: 'Cybertron ',
    ...over,
  } as unknown as ShipClassEntry;
}

/**
 * The Scout carries BOTH a mine rack and a jammer here so the two defensive
 * rolls inside `cyb_check_damage` are individually reachable; the ships that
 * must not use one simply carry none of that item, which is canon's own second
 * condition (`ptr->items[I_MINE] > 0`).
 */
const CLASSES: Record<number, ShipClassEntry> = {
  [CLASS_INTERCEPTOR]: classEntry({ maxTons: 100, noClaim: 1, typeName: 'Interceptor' }),
  [CLASS_SCOUT]: classEntry({
    tough: 0, hasMine: true, hasJammer: true, typeName: 'Cybertron Scout',
  }),
};

function fixedRandom(value: number): Random {
  return { next: () => value } as unknown as Random;
}

/** Draws in order; the final value repeats for every draw after the list. */
function sequenceRandom(values: number[]): Random {
  let i = 0;
  return {
    next: () => values[Math.min(i++, values.length - 1)],
  } as unknown as Random;
}

const CTX: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };

interface Harness {
  svc: CybertronTickService;
  ships: ShipState[];
  events: EventEmitter2;
  spawned: Array<{ userid: string; shipno: number; xcoord: number; ycoord: number }>;
  mines: Array<{ xcoord: number; ycoord: number; channel: number }>;
}

function harness(ships: ShipState[], rand: Random): Harness {
  const shipState = {
    findAllShips: () => ships,
    findByUserid: () => [],
    get: (userid: string, shipno: number) =>
      ships.find((s) => s.userid === userid && s.shipno === shipno),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => { ships.push(s); },
    removeFromGame: () => {}, size: () => ships.length,
  } as unknown as ShipStateService;

  const classCache = {
    get: (c: number) => CLASSES[c],
    getCategory: (c: number) => CLASSES[c]?.category,
    getMaxTons: (c: number) => CLASSES[c]?.maxTons ?? 100,
    getMaxShields: (c: number) => CLASSES[c]?.maxShields ?? 1,
    getScanRange: (c: number) => CLASSES[c]?.scanRange ?? SCAN_RANGE,
    getTypeName: (c: number) => CLASSES[c]?.typeName ?? '',
  } as unknown as ShipClassCacheService;

  const spawned: Harness['spawned'] = [];
  const mines: Harness['mines'] = [];
  let nextMineId = 1;

  // `createSpawn` loads the new hull into the in-memory map synchronously in
  // production (see the boot-seed note in onModuleInit) — the population cap
  // is only correct because the next count sees it, so the fake does the same.
  const repository = {
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n,
    flushShipsImmediate: vi.fn(),
    incrementKills: vi.fn().mockResolvedValue(undefined),
    creditAllowances: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn(async (slot: {
      userid: string; shipno: number; classNumber: number;
      xcoord: number; ycoord: number; topspeed: number;
    }) => {
      spawned.push({
        userid: slot.userid, shipno: slot.shipno,
        xcoord: slot.xcoord, ycoord: slot.ycoord,
      });
      ships.push(makeShip({
        userid: slot.userid, shipno: slot.shipno, channel: slot.shipno,
        shpclass: slot.classNumber, status: GESTAT_AUTO,
        xcoord: slot.xcoord, ycoord: slot.ycoord, topspeed: slot.topspeed,
      } as Partial<ShipState>));
    }),
  } as unknown as CybertronRepository;

  const mineRepo = {
    create: vi.fn(async (input: { channel: number; xcoord: number; ycoord: number }) => {
      const mine = { id: nextMineId++, timer: 10, ...input };
      mines.push({ xcoord: input.xcoord, ycoord: input.ycoord, channel: input.channel });
      return mine;
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as MineRepository;

  const mineRegistry = {
    add: () => true, remove: () => {}, getAll: () => [],
  } as unknown as MineRegistry;

  const events = new EventEmitter2();
  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState,
    classCache,
    repository,
    events,
    rand,
    undefined,
    undefined,
    mineRegistry,
    mineRepo,
  );
  return { svc, ships, events, spawned, mines };
}

/** The whole per-activation body, exactly as the 1s AI tick calls it. */
function lives(svc: CybertronTickService, ship: ShipState): void {
  (svc as unknown as {
    cybLives: (s: ShipState, c: TickContext) => void;
  }).cybLives(ship, CTX);
}

/** `db_update`, as `cyb_lives` calls it: (ship, topspeed * 1000). */
function updateDb(svc: CybertronTickService, ship: ShipState, topSpeed = TOP_SPEED): void {
  (svc as unknown as {
    cybUpdateDb: (s: ShipState, top: number) => void;
  }).cybUpdateDb(ship, topSpeed);
}

function spawnOne(svc: CybertronTickService, classNumber: number): Promise<boolean> {
  return (svc as unknown as {
    spawnOne: (c: number, ctx?: TickContext) => Promise<boolean>;
  }).spawnOne(classNumber);
}

/** Replace one class's population/engagement config so the case is not tied to UNIVMAX. */
function setClassConfig(
  svc: CybertronTickService,
  classNumber: number,
  config: CybertronClassConfig,
): void {
  (svc as unknown as {
    classConfigs: Record<number, CybertronClassConfig>;
  }).classConfigs[classNumber] = config;
}

/** Let layMine's create-then-spend promise settle. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('the idle wander is gated on the update counter (GECYBS.C:463-478)', () => {
  it('a counter above 1 only ticks down — no new course', () => {
    // `if (ptr->cybupdate > 1) { --ptr->cybupdate; return; }` — GECYBS.C:463.
    // The early return is what makes this a ~150-activation cadence rather
    // than a re-roll on every pass; without it a Cybertron would change its
    // mind every activation and never travel anywhere.
    const cyb = cybertron({ cybupdate: 5, cybmine: 255, speed2b: 1_234, head2b: 77 });
    const { svc } = harness([cyb], fixedRandom(0.5));

    updateDb(svc, cyb);

    expect(cyb.cybupdate).toBe(4);
    expect(cyb.speed2b).toBe(1_234);
    expect(cyb.head2b).toBe(77);
  });

  it('at 1, an unclaimed Cybertron picks a fresh course and re-arms the counter', () => {
    // `ptr->speed2b = rndm(d_topspeed); ptr->head2b = rndm(359.9);
    //  ptr->cybupdate = 100 + gernd()%100;` — GECYBS.C:471-476. Draw 0.5:
    // 0.5*8000 = 4000, 0.5*359.9 = 179.95, 100 + floor(0.5*100) = 150.
    const cyb = cybertron({ cybupdate: 1, cybmine: 255, speed2b: 1_234, head2b: 77 });
    const { svc } = harness([cyb], fixedRandom(0.5));

    updateDb(svc, cyb);

    expect(cyb.speed2b).toBeCloseTo(4_000, 6);
    expect(cyb.head2b).toBeCloseTo(179.95, 6);
    expect(cyb.cybupdate).toBe(150);
  });

  it('but a Cybertron that holds a claim keeps its course — only the counter re-arms', () => {
    // `if (ptr->cybmine == 255)` wraps the two assignments, NOT the re-arm
    // (GECYBS.C:471-476). Drop that guard and a Cybertron in mid-pursuit
    // turns onto a random bearing every 150 activations, so a hunted player
    // watches their pursuer wander off for no reason.
    const cyb = cybertron({ cybupdate: 1, cybmine: 9, speed2b: 1_234, head2b: 77 });
    const prey = player(9, { xcoord: 21, ycoord: 20 });
    const { svc } = harness([cyb, prey], fixedRandom(0.5));

    updateDb(svc, cyb);

    expect(cyb.speed2b).toBe(1_234);
    expect(cyb.head2b).toBe(77);
    expect(cyb.cybupdate).toBe(150);
  });

  it('the wander speed is the HULL top speed, warp-scaled — through cyb_lives itself', () => {
    // The caller's arithmetic: `const topSpeed = (ship.topspeed ?? 0) * 1000.0`.
    // `topspeed` is stored in warp units and every speed order in the AI comes
    // off this one multiply, so a wrong factor here makes every Cybertron in
    // the galaxy an order of magnitude too fast or too slow. Alone in the
    // world, so nothing else can move it: the engagement scan finds no player
    // and the lockon scan finds no eligible target.
    const cyb = cybertron({ cybupdate: 1, cybmine: 255, topspeed: 8 });
    const { svc } = harness([cyb], fixedRandom(0.5));

    lives(svc, cyb);

    expect(cyb.speed2b).toBeCloseTo(4_000, 6);
    expect(cyb.cybupdate).toBe(150);
  });
});

describe('a wounded Cybertron defends itself (GECYBS.C:625-641 cyb_check_damage)', () => {
  /**
   * Every case here enters at `cybLives`, which is the only caller. The
   * geometry is deliberate: the claimed player sits ~57 sectors out, far
   * beyond the class's 10-sector scan range, so `runEngagementScan` skips it
   * and cannot touch the fields under test. `cyb_check_damage` then sets
   * `holdcourse` to at least 5, and `cyb_check_lockon` opens by decrementing
   * holdcourse and returning (GECYBS.C:672) — so the pursuit ladder never
   * runs and the scrambled course survives the activation, exactly as in
   * canon.
   */
  const FAR = { xcoord: 60, ycoord: 60 };

  it('rolls a mine into its wake and scrambles its heading', async () => {
    // All-zero draws: gate `gernd()%10 == 0` passes, `gernd()%5 == 0` lays the
    // mine, head2b = 0, holdcourse = 0 + 5. The jammer roll is unreachable
    // because the hull carries none — canon's `ptr->items[I_JAMMERS] > 0`.
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MINE] = 3n;
    const cyb = cybertron({
      cybmine: 9, damage: CYB_MINDAM + 1, items, speed2b: 100, head2b: 77, holdcourse: 0,
    });
    const prey = player(9, FAR);
    const { svc, mines } = harness([cyb, prey], fixedRandom(0));

    lives(svc, cyb);
    await settle();

    expect(mines).toEqual([{ xcoord: 20, ycoord: 20, channel: 201 }]);
    expect(cyb.items[I_MINE]).toBe(2n);
    expect(cyb.cantexit).toBe(FIRETICKS);
    expect(cyb.speed2b).toBe(TOP_SPEED);
    expect(cyb.head2b).toBe(0);
    // 5 set by cyb_check_damage, then decremented by cyb_check_lockon's
    // holdcourse branch on the same activation.
    expect(cyb.holdcourse).toBe(4);
  });

  it('damage exactly at CYB_MINDAM is not enough — canon tests strictly greater', async () => {
    // `ptr->damage > CYB_MINDAM` (GECYBS.C:626). At 75 nothing fires, even
    // with every roll a zero. Relax this to `>=`, or lower CYB_MINDAM, and a
    // Cybertron that has taken one scratch starts mining the sector.
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MINE] = 3n;
    const cyb = cybertron({ cybmine: 9, damage: CYB_MINDAM, items, holdcourse: 0 });
    const prey = player(9, FAR);
    const { svc, mines } = harness([cyb, prey], fixedRandom(0));

    lives(svc, cyb);
    await settle();

    expect(mines).toEqual([]);
    expect(cyb.items[I_MINE]).toBe(3n);
    expect(cyb.cantexit).toBe(0);
    expect(cyb.holdcourse).toBe(0);
  });

  it('and a Cybertron with no claim does not mine, however badly hurt', async () => {
    // `ptr->cybmine < 255` is the first term (GECYBS.C:625): this is a
    // response to the fight it is IN. Without the guard, every idle wreck in
    // the galaxy seeds mines wherever it drifts.
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MINE] = 3n;
    const cyb = cybertron({ cybmine: 255, damage: 200, items, holdcourse: 0 });
    const prey = player(9, FAR);
    const { svc, mines } = harness([cyb, prey], fixedRandom(0));

    lives(svc, cyb);
    await settle();

    expect(mines).toEqual([]);
    expect(cyb.items[I_MINE]).toBe(3n);
    expect(cyb.cantexit).toBe(0);
    expect(cyb.holdcourse).toBe(0);
  });

  it('burns a jammer on the 1-in-100 without also laying a mine', async () => {
    // Draw order inside cyb_check_damage: [0] the 1-in-10 gate, [0.9] the
    // 1-in-5 mine roll (floor(0.9*5)=4, no mine), [0] the 1-in-100 jammer
    // roll, then head2b and holdcourse. The two rolls are independent in
    // canon (GECYBS.C:629-637); coupling them, or widening the jammer roll,
    // empties a Cybertron's jammer rack in a single firefight.
    const items = Array.from({ length: NUMITEMS }, () => 0n);
    items[I_MINE] = 3n;
    items[I_JAMMER] = 2n;
    const cyb = cybertron({
      cybmine: 9, damage: CYB_MINDAM + 1, items, holdcourse: 0,
    });
    const prey = player(9, FAR);
    const { svc, mines } = harness(
      [cyb, prey],
      sequenceRandom([0, 0.9, 0, 0.5, 0.5]),
    );

    lives(svc, cyb);
    await settle();

    expect(cyb.items[I_JAMMER]).toBe(1n);
    expect(mines).toEqual([]);
    expect(cyb.items[I_MINE]).toBe(3n);
    // head2b = 0.5*359.9, holdcourse = floor(0.5*10)+5 = 10, less the
    // cyb_check_lockon decrement.
    expect(cyb.head2b).toBeCloseTo(179.95, 6);
    expect(cyb.holdcourse).toBe(9);
  });
});

describe('the brake band actually brakes (GECYBS.C:756-761)', () => {
  /** Pinned locally so a sysop HYPDST1/HYPDST2 override cannot move the band. */
  const BANDS: CybertronClassConfig = {
    tot_to_create: 3, tooclose: 3_000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 1_200,
  };

  /**
   * `if (ptr->speed > 20000.0) ptr->speed = 20000.0;` is the first statement
   * of the band, before the heading and the speed order. `pickPursuitBand`
   * only REPORTS the ceiling as `speedClamp`; applying it is the tick
   * service's job, and that half had no test.
   *
   * 15 sectors out: past hyperdist2 (10) and short of hyperdist1 (25), which
   * is the band. Beyond the 10-sector scan range too, so the engagement scan
   * takes no part. Draw 0.99 fails the taunt roll (`gernd()%60 == 1`).
   */
  it('a Cybertron arriving out of hyperwarp is cut to 20,000, not left at warp speed', () => {
    const cyb = cybertron({ cybmine: 9, speed: 50_000, where: 0, cybupdate: 5 });
    const prey = player(9, { xcoord: 35, ycoord: 20 });
    const { svc } = harness([cyb, prey], fixedRandom(0.99));
    setClassConfig(svc, CLASS_SCOUT, BANDS);

    lives(svc, cyb);

    expect(cyb.speed).toBe(20_000);
    expect(cyb.speed2b).toBe(TOP_SPEED);
    expect(cyb.where).toBe(0);
  });

  it('and one already slower than the ceiling is left alone — the clamp never accelerates', () => {
    // Canon's `if` is a ceiling, not an assignment. Make it unconditional and
    // a Cybertron closing at 5,000 is thrown up to 20,000 instead, arriving
    // four times too fast — the difference between a fight and a ram.
    const cyb = cybertron({ cybmine: 9, speed: 5_000, where: 0, cybupdate: 5 });
    const prey = player(9, { xcoord: 35, ycoord: 20 });
    const { svc } = harness([cyb, prey], fixedRandom(0.99));
    setClassConfig(svc, CLASS_SCOUT, BANDS);

    lives(svc, cyb);

    expect(cyb.speed).toBe(5_000);
    expect(cyb.speed2b).toBe(TOP_SPEED);
  });
});

describe('spawn bookkeeping — population cap, ship numbers, placement', () => {
  const CONFIG: CybertronClassConfig = {
    tot_to_create: 3, tooclose: 3_000, hyperdist1: 25, hyperdist2: 10, cyb_gold: 1_200,
  };

  it('takes the lowest free ship number at or above 200', async () => {
    // `let shipno = 200; while (taken.has(shipno)) shipno++`. The ship number
    // is the identity a Cybertron is saved and looked up under; hand a new one
    // a number already in use and the spawn overwrites a living hull.
    const existing = [
      cybertron({ userid: 'Cybrg-200', shipno: 200, channel: 200 }),
      cybertron({ userid: 'Cybrg-202', shipno: 202, channel: 202 }),
    ];
    const { svc, spawned } = harness(existing, fixedRandom(0.25));
    setClassConfig(svc, CLASS_SCOUT, CONFIG);

    const created = await spawnOne(svc, CLASS_SCOUT);

    expect(created).toBe(true);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].shipno).toBe(201);
    expect(spawned[0].userid).toBe('Cybrg-201');
  });

  it('is born inside the galaxy, on either side of the origin', async () => {
    // `random * UNIVMAX * 2 - UNIVMAX` spans the whole square. Drop the `- UNIVMAX`
    // (or the `* 2`) and every Cybertron in the game spawns in one quadrant,
    // leaving half the galaxy permanently safe. Draw 0.25 → -UNIVMAX/2.
    const { svc, spawned } = harness([], fixedRandom(0.25));
    setClassConfig(svc, CLASS_SCOUT, CONFIG);

    await spawnOne(svc, CLASS_SCOUT);

    expect(spawned[0].xcoord).toBeCloseTo(-UNIVMAX / 2, 6);
    expect(spawned[0].ycoord).toBeCloseTo(-UNIVMAX / 2, 6);
    expect(Math.abs(spawned[0].xcoord)).toBeLessThanOrEqual(UNIVMAX);
  });

  it('refuses once the class is at tot_to_create', async () => {
    // `if (currentCount >= config.tot_to_create) return false`. Slip this to
    // `>` and the steady-state population is one hull per class too many,
    // every class, forever — the cap is the only thing bounding it.
    const existing = [
      cybertron({ userid: 'Cybrg-200', shipno: 200, channel: 200 }),
      cybertron({ userid: 'Cybrg-201', shipno: 201, channel: 201 }),
      cybertron({ userid: 'Cybrg-202', shipno: 202, channel: 202 }),
    ];
    const { svc, spawned, ships } = harness(existing, fixedRandom(0.25));
    setClassConfig(svc, CLASS_SCOUT, CONFIG);

    const created = await spawnOne(svc, CLASS_SCOUT);

    expect(created).toBe(false);
    expect(spawned).toEqual([]);
    expect(ships).toHaveLength(3);
  });

  it('counts only this class toward the cap', async () => {
    // `aiShips.filter((s) => s.shpclass === classNumber)`. Count every AI hull
    // instead and a galaxy full of Scouts blocks the Base Star from ever
    // spawning — the class the whole difficulty curve ends at.
    const existing = [
      cybertron({ userid: 'Cybrg-200', shipno: 200, channel: 200, shpclass: CLASS_SCOUT }),
      cybertron({ userid: 'Cybrg-202', shipno: 202, channel: 202, shpclass: CLASS_SCOUT }),
      // A third AI hull, of a DIFFERENT class: it must not count against the
      // Scout's cap.
      cybertron({
        userid: 'Cybrg-203', shipno: 203, channel: 203, shpclass: CLASS_INTERCEPTOR,
      }),
    ];
    const { svc, spawned } = harness(existing, fixedRandom(0.25));
    setClassConfig(svc, CLASS_SCOUT, CONFIG);

    const created = await spawnOne(svc, CLASS_SCOUT);

    expect(created).toBe(true);
    expect(spawned).toHaveLength(1);
  });
});

describe('what a Cybertron does after it kills you (cyb_won)', () => {
  it('releases the claim and settles to warp 2 when the kill event arrives', async () => {
    //   ptr->cybmine = 255; ptr->speed2b = 2000.0; ptr->cybupdate = 0;
    // Reached through the real path — PlayerScoreService raises
    // CYBERTRON_SCORED_KILL and the listener is registered in onModuleInit.
    // Without it the claim clears only incidentally, on the next activation's
    // "target left the game" branch, which assigns a RANDOM speed: a Cybertron
    // that just killed someone tears off at top speed instead of loitering
    // over the wreck, which is what the next arrival meets.
    const previous = process.env.CYBERTRON_BOOT_SEED;
    process.env.CYBERTRON_BOOT_SEED = 'false';
    try {
      const cyb = cybertron({ cybmine: 7, speed2b: 9_000, cybupdate: 42 });
      const { svc, events } = harness([cyb], fixedRandom(0.5));
      await svc.onModuleInit();

      events.emit(CYBERTRON_SCORED_KILL, {
        attackerUserid: 'Cybrg-201',
        attackerShipKey: 'Cybrg-201:201',
      } satisfies CybertronScoredKillEvent);

      expect(cyb.cybmine).toBe(255);
      expect(cyb.speed2b).toBe(CYB_WON_SPEED);
      expect(cyb.cybupdate).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.CYBERTRON_BOOT_SEED;
      else process.env.CYBERTRON_BOOT_SEED = previous;
    }
  });
});
