/**
 * Round three: the decisions still open in the two AI brains, in one file.
 *
 * Rounds one and two took the fight-back translation, the acquisition filters,
 * the lifecycle and the kill ledger. What is left in
 * `droid-tick.service.ts` and `cybertron-tick.service.ts` is a much shorter
 * list than the raw coverage report suggests, because most of the remaining
 * conditionals are DEFENCE IN DEPTH: a second copy of a gate the only caller
 * has already applied, added deliberately (see the A-002 notes in both files)
 * so a future caller cannot bypass it. Those cannot be entered from any real
 * path, and forcing them through a private method would prove nothing about
 * the game. They are listed at the bottom of this comment rather than tested.
 *
 * What IS tested here, and what it costs a player to get it wrong:
 *
 *  A1. The Vakory's attack-vector scramble (`fb.alterVector`,
 *      droid-tick.service.ts:395). Canon rolls 1-in-20 and, when it lands,
 *      rewrites heading, speed AND hold-course together. Drop the application
 *      and the drone flies a straight line through a firefight — free kills.
 *      @see GEDROIDS.C:491-494
 *  A2. A torpedo aimed at a pilot whose three tubes are already tracking
 *      (`findFreeTorpSlot === -1`, droid-tick.service.ts:627). MAXTORPS is 3;
 *      a fourth lock would be a torpedo the victim can never shake.
 *      @see GECMDS.C:1178-1184
 *  B1. The hyperspace engagement's `canHit` disjunction
 *      (cybertron-tick.service.ts:437). Round two entered it only inside the
 *      `tooclose` band, where the first operand short-circuits the rest. The
 *      three operands past it are what makes a running fight a fight: once
 *      either ship is battle-locked, distance stops protecting anyone.
 *      @see GECYBS.C:270-273
 *  B2. The neutral zone on the ACQUISITION side
 *      (cybertron-tick.service.ts:922). Round two pinned the neutral zone in
 *      the engagement scan; `cyb_check_lockon` is a separate pass reached from
 *      `cyb_lives` whatever the scan decided, and it is the one that decides
 *      whether a new pilot gets hunted at all. @see GECYBS.C:709-731
 *  B3. The Zipper sweep's range test (cybertron-tick.service.ts:744). A
 *      Cybertron that clears mines it cannot see erases a minefield a player
 *      paid for from the other side of the galaxy. @see GECMDS.C:1690-1712
 *  B4. The end-of-`cyb_lives` tick recalculation
 *      (cybertron-tick.service.ts:325). This is the AI's reaction rate: idle,
 *      in a fight, and in a fight against a Cyberquad. Getting it wrong makes
 *      the whole galaxy uniformly slower or uniformly lethal, and it is
 *      invisible in every other test because nothing else reads `tick`.
 *      @see GECYBS.C:338-352
 *
 * DELIBERATELY NOT TESTED — unreachable from every caller, or excluded by
 * docs/TEST_STRATEGY.md. Recorded so the gap is a decision:
 *
 *  - droid-tick.service.ts:425 (`phasr < PMINFIRE`), :426 (`cloak === 10`),
 *    :435 (scan-range) — `droidActClass11`/`12` only set `fireMode: 'normal'`
 *    when `droid.phasr >= PMINFIRE && attackerState.cloak !== 10 &&
 *    ddist < scanRange` (droid-act-class-12.ts:129), and `firePhaser` has no
 *    other caller. Its gates are strictly weaker (`<=` vs `<`) than the ones
 *    upstream, so no state reaches them.
 *  - droid-tick.service.ts:475 (`aiCanHitTarget`) — the same decision
 *    functions route a target at `where === 1` to the HYPER branch, so
 *    `firePhaser` is never handed one.
 *  - droid-tick.service.ts:545 (`ddist >= fightbackHyperspaceMaxDist`) —
 *    `fireMode: 'hyper'` is only set for `ddist < 30_000`, the same default
 *    (droid.config.ts:44). Reachable only if `DROID_FIGHTBACK_HYPER_DIST` is
 *    lowered below 30000 in the environment.
 *  - droid-tick.service.ts:639 (empty mine hold) and :668 (empty jammer hold)
 *    — the class-12 descriptor already carries `layMine`/`deployJammer` as
 *    booleans computed from those same item counts, and the service only calls
 *    the helpers when the flag is set.
 *  - droid-tick.service.ts:676 (`command === undefined`) — every call site
 *    passes a defined command or tests for undefined first; class 10 returns a
 *    `shieldCommand` unconditionally.
 *  - droid-tick.service.ts:177 (`if (!pop) continue`) — `livePopulation` is
 *    seeded with all three classes at construction and no key is ever deleted.
 *  - droid-tick.service.ts:707 (`if (!event) return`) — no emitter in the port
 *    publishes COMBAT_SHIP_DESTROYED without a payload.
 *  - cybertron-tick.service.ts:534 and :542 — `cybAttack` already tests
 *    `ship.phasr >= PMINFIRE` (line 702) and skips any candidate with
 *    `ddist > scanRange` (line 409) using the same cache value;
 *    `cybFirePhaser` has no other caller.
 *  - cybertron-tick.service.ts:1191 (`if (!config) return false`) — both
 *    callers of `spawnOne` draw the class number FROM `classConfigs`
 *    (`Object.keys` at :167, `pickSpawnClass` at :1169).
 *  - cybertron-tick.service.ts:399, :805, :957 — the
 *    `'tickNumber' in ctx` ternaries. `ctx` is a typed `TickContext` on every
 *    path; these are display fallbacks for the event payload.
 *  - droid :454, :572 and cybertron :579 — `if (this.combatTick)`, the
 *    optional-dependency guard docs/TEST_STRATEGY.md excludes by name.
 *
 * @see docs/TEST_STRATEGY.md — the filter, and "test the caller's arithmetic"
 */

import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Random } from '../../../src/game/combat/random.port';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import {
  CYBTICKTIME,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  GESTAT_AUTO,
  GESTAT_USER,
  TOOCLOSE,
} from '../../../src/game/constants';
import { makeShip as buildShip } from '../../helpers/make-ship';

/** One sector, in the raw coordinate units every range constant is stored in. */
const SECTOR = 10_000;

/** Canon's Vakory scanner: `S33SRNG {Scan Range: 25000}` (GE/REL/MBMGESHP.MSG:7482). */
const VAKORY_SCAN_RANGE = 25_000;

// Local defaults layered on the shared factory: this suite's victim is a
// player-controlled hull (GESTAT_USER) that has never been fired on
// (`lastfired: -1`, distinct from channel 0), with a full weapons rack of
// empty slots (channel 255) and a full item table.
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return buildShip({
    userid: 'p1',
    shipname: 'Victim',
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    userKills: 0,
    lastfired: -1,
    shieldtype: 2,
    shield: 100,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    items: Array.from({ length: NUMITEMS }, () => 0n),
    status: GESTAT_USER,
    cybmine: 255,
    cybskill: 5,
    tick: 6,
    topspeed: 8,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  });
}

/** A Random that always returns the same draw — every roll becomes arithmetic. */
function fixedRandom(value: number): Random {
  return { next: () => value } as unknown as Random;
}

/**
 * A Random that plays a written script and then settles on `tail`. Used only
 * where two rolls in one decision need different values; each test that uses
 * it names the draw each entry answers.
 */
function scriptedRandom(script: readonly number[], tail = 0.99): Random {
  let i = 0;
  return { next: () => (i < script.length ? script[i++] : tail) } as unknown as Random;
}

function shipStateStub(ships: ShipState[]): ShipStateService {
  return {
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
    removeFromGame: jest.fn(),
    size: () => ships.length,
  } as unknown as ShipStateService;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Droid — droid-tick.service.ts
// ─────────────────────────────────────────────────────────────────────────────

const VAKORY_CLASS: ShipClassEntry = {
  maxPrice: 0n,
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: VAKORY_SCAN_RANGE, maxTons: 100, hasTorpedo: true, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false,
  noClaim: 0, tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100, typeName: 'Vakory Survey Drone',
  category: 'CPU_DROID', shipNameTemplate: '',
} as unknown as ShipClassEntry;

interface DroidHarness {
  svc: DroidTickService;
  droid: ShipState;
}

/**
 * A Vakory that has been shot at by `target`. Fight-back needs BOTH
 * `cantexit > 0` and `lastfired` pointing at the attacker's CHANNEL
 * (GEDROIDS.C:443), so both are stated rather than arrived at.
 *
 * `phasr: 0` throughout this section. Canon puts the torpedo volley and the
 * attack-vector scramble OUTSIDE the phaser gate (GEDROIDS.C:472-494), so a
 * cold bank is a legitimate state for both branches under test and it keeps
 * phaser damage out of the assertions.
 */
function droidHarness(rand: Random, droidOver: Partial<ShipState>, target: ShipState): DroidHarness {
  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, channel: 1, shipname: 'Vakory',
    shpclass: DROID_CLASS_VAKORY, status: GESTAT_AUTO,
    topspeed: 4, phasr: 0, phasrtype: 1, damage: 0,
    xcoord: 0, ycoord: 0,
    cantexit: 5, lastfired: target.channel ?? 2,
    ...droidOver,
  });

  const ships = [droid, target];
  const shipState = shipStateStub(ships);
  const classCache = {
    get: () => VAKORY_CLASS,
    getMaxPhaser: () => 1,
    getMaxTons: () => 100,
    getMaxShields: () => 1,
    getScanRange: () => VAKORY_SCAN_RANGE,
  } as unknown as ShipClassCacheService;

  const svc = new DroidTickService(
    { subscribe: jest.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, rand),
    { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry,
    { create: jest.fn().mockResolvedValue({ id: 1 }) } as unknown as MineRepository,
    new EventEmitter2(), rand,
  );
  return { svc, droid };
}

function act12(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass12: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass12(droid, players, VAKORY_SCAN_RANGE, 1);
}

describe('the Vakory scrambles its attack vector mid-fight (GEDROIDS.C:491-494)', () => {
  /**
   * `if (ptr->holdcourse == 0 && (gernd()%20) == 1) { speed2b = rndm(5000.0);
   *  head2b = rndm(359.9); holdcourse = gernd()%10 + 3; }`
   *
   * A constant 0.06 draw makes every roll in the pass arithmetic:
   *   - `gernd()%20`  → floor(0.06*20) = 1  → the scramble LANDS
   *   - `rollAnnoy(4)`→ floor(0.06*4)  = 0  ≠ 1 → no chatter
   *   - `gernd()%2`   → floor(0.06*2)  = 0  → a zero-torpedo volley
   * so nothing else in the descriptor can move the three fields asserted.
   */
  const DRAW = 0.06;

  it('a landed roll rewrites speed, heading and hold-course together', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0,
    });
    const { svc, droid } = droidHarness(fixedRandom(DRAW), {
      speed2b: 4_000, head2b: 270, holdcourse: 0,
    }, target);

    act12(svc, droid, [target]);

    // rndm(5000.0), rndm(359.9), gernd()%10 + 3 — in that order.
    expect(droid.speed2b).toBeCloseTo(DRAW * 5_000.0, 6);
    expect(droid.head2b).toBeCloseTo(DRAW * 359.9, 6);
    expect(droid.holdcourse).toBe(Math.floor(DRAW * 10) + 3);
  });

  it('but a drone already holding a course is left on it', () => {
    // Same draw, same geometry: only `holdcourse != 0` differs, and canon's
    // guard is the reason the drone finishes an evasive leg before rolling a
    // new one. If the service applied `alterVector` unconditionally the three
    // assertions below would all move.
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0,
    });
    const { svc, droid } = droidHarness(fixedRandom(DRAW), {
      speed2b: 4_000, head2b: 270, holdcourse: 7,
    }, target);

    act12(svc, droid, [target]);

    expect(droid.speed2b).toBe(4_000);
    expect(droid.head2b).toBe(270);
    expect(droid.holdcourse).toBe(7);
  });
});

describe('a Droid torpedo needs a free tube on the victim (GECMDS.C:1178-1184)', () => {
  /**
   * `for (i=0;i<MAXTORPS;++i) if (wptr->ltorps[i].channel == 255) break;
   *  if (i == MAXTORPS) { prfmsg(TORFULL); return; }`
   *
   * MAXTORPS is 3, and the array is a Postgres `Int[]` whose LENGTH carries no
   * information — the bound is the constant, never the array. A 0.99 draw
   * gives `gernd()%2 = 1`, a one-torpedo volley, and fails the 1-in-20
   * scramble, so exactly one launch is attempted in each case below.
   */
  const VOLLEY_DRAW = 0.99;

  it('takes the LOWEST free tube, not the end of the array', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0,
      ltorpsChannel: [7, 255, 9], ltorpsDistance: [1_000, 0, 2_000],
    });
    const { svc, droid } = droidHarness(fixedRandom(VOLLEY_DRAW), {}, target);

    act12(svc, droid, [target]);

    // Slot 1 is the one C's loop breaks on; slots 0 and 2 belong to torpedoes
    // already in flight and must not be overwritten.
    expect(target.ltorpsChannel).toEqual([7, droid.channel, 9]);
    expect(target.ltorpsDistance[1]).toBeCloseTo(0.1 * SECTOR, 6);
    expect(target.ltorpsDistance[0]).toBe(1_000);
    expect(target.ltorpsDistance[2]).toBe(2_000);
  });

  it('and is discarded when all three are already tracking', () => {
    // A fourth simultaneous lock is a torpedo the pilot can never shake: there
    // is no fourth slot to clear it from. Canon prints TORFULL and returns.
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 0.1, ycoord: 0,
      ltorpsChannel: [7, 8, 9], ltorpsDistance: [1_000, 2_000, 3_000],
    });
    const { svc, droid } = droidHarness(fixedRandom(VOLLEY_DRAW), {}, target);

    act12(svc, droid, [target]);

    expect(target.ltorpsChannel).toEqual([7, 8, 9]);
    expect(target.ltorpsDistance).toEqual([1_000, 2_000, 3_000]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Cybertron — cybertron-tick.service.ts
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_INTERCEPTOR = 1;
const CLASS_SCOUT = 21;
const CLASS_QUAD = 24;

const CYB_TOP_SPEED = 8_000;

function cybClass(over: Partial<ShipClassEntry>): ShipClassEntry {
  return {
    maxAcceleration: 1200, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 100_000, maxTons: 900, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100,
    typeName: 'harness', category: 'CPU_COMBATIVE', shipNameTemplate: 'Cybertron ',
    ...over,
  } as unknown as ShipClassEntry;
}

/**
 * `cybCanAttack` is FALSE for the player hull on purpose: canon's
 * `shipclass[wptr->shpclass].cybs_can_att` short-circuits the range test
 * (GECYBS.C:271), so a class carrying it would make every case below vacuous.
 */
const CYB_CLASSES: Record<number, ShipClassEntry> = {
  [CLASS_INTERCEPTOR]: cybClass({ maxTons: 100, noClaim: 1, typeName: 'Interceptor' }),
  [CLASS_SCOUT]: cybClass({ tough: 0, typeName: 'Cybertron Scout' }),
  [CLASS_QUAD]: cybClass({ tough: 1, typeName: 'Cyberquad' }),
};

function cybPlayer(channel: number, over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: `p${channel}`, shipno: channel, channel, shipname: `Player${channel}`,
    shpclass: CLASS_INTERCEPTOR, status: GESTAT_USER, xcoord: 5, ycoord: 5, ...over,
  });
}

function cybertron(shpclass: number, over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: 'Cybrg-201', shipno: 201, channel: 201, shipname: 'Cybertron 1',
    shpclass, status: GESTAT_AUTO, heading: 0, topspeed: 8, xcoord: 5, ycoord: 5, ...over,
  });
}

const CYB_CTX: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };

interface CybHarness {
  svc: CybertronTickService;
  mines: MineRegistry;
  deletedMineIds: number[];
}

function cybHarness(
  ships: ShipState[],
  rand: Random,
  classes: Record<number, ShipClassEntry> = CYB_CLASSES,
): CybHarness {
  const shipState = shipStateStub(ships);
  const classCache = {
    get: (c: number) => classes[c],
    getCategory: (c: number) => classes[c]?.category,
    getMaxTons: (c: number) => classes[c]?.maxTons ?? 100,
    getMaxShields: (c: number) => classes[c]?.maxShields ?? 1,
    getScanRange: (c: number) => classes[c]?.scanRange ?? 100_000,
    getTypeName: (c: number) => classes[c]?.typeName ?? '',
  } as unknown as ShipClassCacheService;

  const mines = new MineRegistry();
  const deletedMineIds: number[] = [];
  const mineRepo = {
    delete: (id: number) => { deletedMineIds.push(id); return Promise.resolve(); },
  } as unknown as MineRepository;

  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState,
    classCache,
    {
      hydrateAll: jest.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
      flushShipsImmediate: jest.fn(),
      incrementKills: jest.fn(),
    } as unknown as CybertronRepository,
    new EventEmitter2(),
    rand,
    undefined,
    undefined,
    mines,
    mineRepo,
  );
  return { svc, mines, deletedMineIds };
}

function scan(svc: CybertronTickService, ship: ShipState): void {
  (svc as unknown as {
    runEngagementScan: (s: ShipState, top: number, c: TickContext) => void;
  }).runEngagementScan(ship, CYB_TOP_SPEED, CYB_CTX);
}

function lockon(svc: CybertronTickService, ship: ShipState): void {
  (svc as unknown as {
    cybCheckLockon: (s: ShipState, top: number, c: TickContext) => void;
  }).cybCheckLockon(ship, CYB_TOP_SPEED, CYB_CTX);
}

function lives(svc: CybertronTickService, ship: ShipState): void {
  (svc as unknown as {
    cybLives: (s: ShipState, c: TickContext) => void;
  }).cybLives(ship, CYB_CTX);
}

describe('battle-lock beats distance in hyperspace (GECYBS.C:270-273)', () => {
  /**
   * `if (ddist < (tooclose+rndm(tooclose)) || shipclass[..].cybs_can_att
   *     || wptr->cantexit > 0 || ptr->cantexit > 0)`
   *
   * Every case below sits 0.5 sectors out — ddist 5,000, against a
   * `tooclose` of 2,500 — so with a zero draw the widened band is 2,500 and
   * the FIRST operand is false. That is the point: round two only ever entered
   * this expression from inside the band, where the `||` short-circuits and
   * the other three operands are never evaluated. Once a shot has been fired
   * either way, canon stops letting range end the engagement, which is what
   * turns a brush-past into a running fight.
   *
   * Both ships at `where: 1` on the +x axis with the attacker heading 0, so
   * the target sits dead centre of the fixed 5-degree hyper beam.
   */
  const ATTACKER_X = 5.0;
  const VICTIM_X = 5.5;

  it('the VICTIM being battle-locked reopens the shot', () => {
    const cyb = cybertron(CLASS_SCOUT, { xcoord: ATTACKER_X, ycoord: 5, where: 1, cantexit: 0 });
    const victim = cybPlayer(2, { xcoord: VICTIM_X, ycoord: 5, where: 1, cantexit: 4 });
    const { svc } = cybHarness([cyb, victim], fixedRandom(0));

    scan(svc, cyb);

    expect(victim.damage).toBeGreaterThan(0);
  });

  it("the ATTACKER's own battle-lock reopens it too", () => {
    // `ptr->cantexit > 0` — the operand the port was missing entirely. A
    // Cybertron that has just fired keeps firing; without it a player could
    // break contact simply by drifting past the tooclose band.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: ATTACKER_X, ycoord: 5, where: 1, cantexit: 4 });
    const victim = cybPlayer(2, { xcoord: VICTIM_X, ycoord: 5, where: 1, cantexit: 0 });
    const { svc } = cybHarness([cyb, victim], fixedRandom(0));

    scan(svc, cyb);

    expect(victim.damage).toBeGreaterThan(0);
  });

  it('with neither locked and the class unattackable, the range holds', () => {
    // Identical geometry, all four operands false. This is the case that makes
    // the two above mean something: at 0.5 sectors, an unengaged Cybertron
    // does NOT shoot.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: ATTACKER_X, ycoord: 5, where: 1, cantexit: 0 });
    const victim = cybPlayer(2, { xcoord: VICTIM_X, ycoord: 5, where: 1, cantexit: 0 });
    const { svc } = cybHarness([cyb, victim], fixedRandom(0));

    scan(svc, cyb);

    expect(victim.damage).toBe(0);
    expect(victim.cantexit).toBe(0);
  });
});

describe('a Cybertron inside the neutral zone hunts nobody (GECYBS.C:709-731)', () => {
  /**
   * The exclusion sits INSIDE the candidate loop in `cyb_check_lockon`, which
   * `cyb_lives` reaches on every activation regardless of what the engagement
   * scan decided. Losing it would not let a Cybertron shoot inside sector
   * (0,0) — the scan still refuses that — but it would let one sitting in the
   * zone claim a pilot and follow them out of it, which is the same outcome
   * one move later.
   *
   * The zone is the WHOLE of sector (0,0): `0 <= x < 1` on each axis
   * (GEPLANET.C:866 neutral, floor-based).
   */
  it('claims nothing while it stands in sector (0,0), and goes back to wandering', () => {
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 0.5, ycoord: 0.5, cybmine: 255, holdcourse: 0 });
    const prey = cybPlayer(2, { xcoord: 2.0, ycoord: 0.5 });
    const { svc } = cybHarness([cyb, prey], fixedRandom(0.99));

    lockon(svc, cyb);

    // `low_ship == -1` → random speed, random heading, re-arm and rest.
    expect(cyb.cybmine).toBe(255);
    expect(cyb.tick).toBe(255);
  });

  it('and claims the same pilot the moment it is one sector outside', () => {
    // Only the attacker's x moves — 0.5 → 1.5, out of sector 0. Everything
    // else is identical, so the claim in this case is attributable to the
    // neutral-zone test and nothing else.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 1.5, ycoord: 0.5, cybmine: 255, holdcourse: 0 });
    const prey = cybPlayer(2, { xcoord: 2.0, ycoord: 0.5 });
    const { svc } = cybHarness([cyb, prey], fixedRandom(0.99));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(prey.channel);
  });
});

describe('the Zipper clears only the mines it can see (GECMDS.C:1690-1712)', () => {
  /**
   * `zip()` walks the galaxy-wide mine table and destroys every mine inside
   * the firing class's scan range. The registry is shared, so a range test
   * that is one comparison out erases mines a player laid on the other side
   * of the galaxy — mines they paid for, in a table with twelve slots for
   * everyone.
   *
   * Entered through the real path: `runEngagementScan` → `cybAttack` →
   * `applyEvasion` → `decideCybEvasion` → `sweepMines`.
   *
   * The draw script, in order of consumption:
   *   1. 0.5  — `rangeFactor = tooclose + rndm(tooclose)`; the ships are 0.05
   *             sectors apart so the value cannot change the outcome.
   *   2. 0.15 — `gernd()%10 == 1` → floor(1.5) = 1, the Zipper roll LANDS.
   *   3. 0.4  — `gernd()%3  == 1` → floor(1.2) = 1, the sweep roll LANDS.
   *   4. 0.4  — `rndm(359.9)`, the retreat heading.
   *   5. 0.4  — `gernd()%20 + 3`, the retreat hold-course.
   *   6. 0.9  — `gernd()%20 == 1` → floor(18), the vector scramble does NOT
   *             land, so it cannot overwrite the assertions.
   * The two `gebemean` calls in `cybAttack` consume NO draws because the
   * target carries more than CYB_BE_NICE kills (GECYBS.C:432), and
   * `rollTorpedoCount` returns before its draw because the class has no
   * torpedoes — both stated in the ship and class below.
   */
  it('destroys the mine inside its scan range and leaves the far ones alone', () => {
    const ZIPPER_CLASS = 25;
    const classes: Record<number, ShipClassEntry> = {
      ...CYB_CLASSES,
      [ZIPPER_CLASS]: cybClass({
        tough: 0, hasZipper: true, hasTorpedo: false, scanRange: 100_000,
        typeName: 'Cybertron Zipper',
      }),
    };

    const cyb = cybertron(ZIPPER_CLASS, {
      xcoord: 20, ycoord: 20, where: 0, phasr: 0, minesnear: 3, cybskill: 5,
    });
    // `userKills` above CYB_BE_NICE makes gebemean unconditional and draw-free.
    const prey = cybPlayer(2, { xcoord: 20.05, ycoord: 20, where: 0, userKills: 50 });

    const { svc, mines, deletedMineIds } = cybHarness(
      [cyb, prey],
      scriptedRandom([0.5, 0.15, 0.4, 0.4, 0.4, 0.9]),
      classes,
    );

    // 1 sector out — inside the 10-sector scan range.
    mines.add({ id: 1, channel: 2, timer: 50, xcoord: 21, ycoord: 20, deployedBy: 'p2' });
    // Exactly 10 sectors — canon's test is `>=`, so the boundary mine SURVIVES.
    mines.add({ id: 2, channel: 2, timer: 50, xcoord: 30, ycoord: 20, deployedBy: 'p2' });
    // 11 sectors — plainly out of range.
    mines.add({ id: 3, channel: 2, timer: 50, xcoord: 31, ycoord: 20, deployedBy: 'p2' });

    scan(svc, cyb);

    expect(mines.getAll().map((m) => m.id).sort()).toEqual([2, 3]);
    expect(deletedMineIds).toEqual([1]);
    // `minesnear` is cleared on the same roll that fires the sweep.
    expect(cyb.minesnear).toBe(0);
  });
});

describe('how fast a Cybertron thinks (GECYBS.C:338-352)', () => {
  /**
   * The tail of `cyb_lives`:
   *
   *   if (ptr->cantexit == 0) ptr->tick = (CYBTICKTIME+gernd()%CYBTICKTIME)*5;
   *   else if (!isquad(ptr))  ptr->tick =  CYBTICKTIME+gernd()%CYBTICKTIME;
   *   else                    ptr->tick =  2+gernd()%CYBTICKTIME;
   *
   * `tick` counts SECONDS on the 1s AI tick, so these three lines ARE the
   * difference between a galaxy that reacts and one that does not: 55 seconds
   * between decisions while cruising, 11 once shots are exchanged, 7 if the
   * thing shooting at you is a Cyberquad. Nothing else in the suite reads
   * `tick` after `cyb_lives`, so a change here is otherwise silent.
   *
   * A constant 0.99 draw fails every `%n == 0` and `%n == 1` roll in the pass,
   * so nothing lays a mine, taunts or breaks off, and `gernd()%CYBTICKTIME`
   * is floor(0.99*6) = 5 in all three cases. The Cybertron is alone in the
   * ship list, so the engagement scan finds no candidates and
   * `cyb_check_lockon` falls into its no-target branch.
   */
  const ROLL = Math.floor(0.99 * CYBTICKTIME);

  it('cruising, it re-decides five times more slowly', () => {
    const cyb = cybertron(CLASS_SCOUT, { cantexit: 0, cybmine: 255, holdcourse: 0, cybupdate: 0 });
    const { svc } = cybHarness([cyb], fixedRandom(0.99));

    lives(svc, cyb);

    expect(cyb.tick).toBe((CYBTICKTIME + ROLL) * 5);
  });

  it('under fire, it drops to the plain CYBTICKTIME band', () => {
    const cyb = cybertron(CLASS_SCOUT, { cantexit: 6, cybmine: 255, holdcourse: 0, cybupdate: 0 });
    const { svc } = cybHarness([cyb], fixedRandom(0.99));

    lives(svc, cyb);

    expect(cyb.tick).toBe(CYBTICKTIME + ROLL);
  });

  it('and a Cyberquad under fire is faster again — 2 + the roll, not 6 + it', () => {
    // `isquad(ptr)` is `tough_factor == CYB_TOUGH_1` (GECYBS.C:834-838). This
    // is the same predicate the break-off roll uses, read the other way round:
    // the Cyberquad neither wanders off nor slows down.
    const quad = cybertron(CLASS_QUAD, { cantexit: 6, cybmine: 255, holdcourse: 0, cybupdate: 0 });
    const { svc } = cybHarness([quad], fixedRandom(0.99));

    lives(svc, quad);

    expect(quad.tick).toBe(2 + ROLL);
  });
});

/**
 * Guards the arithmetic the two hyperspace cases above depend on: the
 * engagement band really is narrower than the range they are fired from, so
 * those tests cannot pass by accident if `TOOCLOSE` is retuned.
 * @see MBMGEMSG.MSG TOOCLOSE, GEMAIN.C:517
 */
describe('the geometry these cases rest on', () => {
  it('0.5 sectors is outside the un-widened tooclose band', () => {
    expect(0.5 * SECTOR).toBeGreaterThan(TOOCLOSE);
    expect(0.5 * SECTOR).toBeLessThan(30_000);
  });
});
