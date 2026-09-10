/**
 * The Droid fight-back decisions — the branches that decide whether a player
 * loses a ship to a Droid, or walks away from one.
 *
 * `DroidTickService` is the worst-covered gameplay file in the codebase
 * (docs/TEST_STRATEGY.md, Tier 1). Its class 11/12 handlers are the point where
 * a pure decision descriptor becomes real damage, real shield state and real
 * velocity, and almost every conditional in that translation was unentered:
 * the jammed-flee early return, hyper versus normal fire, the hyper-phaser's
 * scan-range gate, shields-by-speed, the missile evade, and the >75% damage
 * flee with its mine and jammer.
 *
 * Every case here goes through `actClass11` / `actClass12` — the real brains
 * the tick calls — rather than through `firePhaser`, `layMine` or
 * `deployJammer` directly. That is the rule from docs/TEST_STRATEGY.md: three
 * defects survived 2026-09-09 because a unit test drove a helper with values no
 * caller passes. A test that calls `layMine` proves `layMine` works and says
 * nothing about whether a damaged Vakory ever reaches it.
 *
 * Canon for all of it is GEDROIDS.C `droid_act_class_11` (302-404) and
 * `droid_act_class_12` (410-530), plus the two fire primitives they call,
 * `firep` (GECMDS.C:942-999) and `firehp` (GECMDS.C:1042-1085).
 *
 * Randomness is a fixed 0.99 draw throughout, so every roll's outcome is
 * arithmetic rather than draw order:
 *   - `rollAnnoy(4)`      → floor(0.99*4)=3  ≠ 1 → no chatter
 *   - `alterVectorDenom`  → floor(0.99*20)=19 ≠ 1 → no attack-vector change
 *   - `rollVakoryTorpedoVolley` → floor(0.99*2)=1 → a one-torpedo volley
 *   - `rollRandamage`     → non-zero roll → 'none', so a hit never also
 *                            knocks out a subsystem and muddies the assertion
 *
 * @see GEDROIDS.C:410-530
 * @see docs/TEST_STRATEGY.md — test the caller's arithmetic, not the function's
 */
import type { Random } from '../../../src/game/combat/random.port';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import {
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  GESTAT_USER,
  FIRETICKS,
  JAMTIME,
} from '../../../src/game/constants';
import { I_JAMMER, I_MINE } from '../../../src/game/constants/items';

/**
 * Canon's Vakory scanner: `S33SRNG {Scan Range: 25000}`
 * (GE/REL/MBMGESHP.MSG:7482). It is BELOW the hard-coded 30000 hyper-phaser
 * gate, which is exactly what makes the scan-range case below reachable.
 */
const SCAN_RANGE = 25_000;

/** One sector in the raw units every range constant is stored in. */
const SECTOR = 10_000;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'p1', shipno: 1, shipname: 'Victim', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 2, shieldstat: 0, shield: 100, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_USER, cybmine: 255, cybskill: 0,
    cybupdate: 0, tick: 6, emulate: 0, minesnear: 0, lock: 0,
    holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

const CLASS_ENTRY: ShipClassEntry = {
  maxAcceleration: 1200, maxWarp: 4, maxPhaser: 1, maxShields: 1,
  scanRange: SCAN_RANGE, maxTons: 100, hasTorpedo: true, hasMissile: false,
  hasJammer: true, hasMine: true, hasZipper: false, hasCloak: false, hasDecoy: false,
  noClaim: 0, tough: 0, cybLowestClassAttacks: 0, cybCanAttack: false, points: 50,
  canAttackPlanet: false, damageFactor: 100, typeName: 'Vakory Survey Drone',
  category: 'CPU_DROID', shipNameTemplate: '',
} as unknown as ShipClassEntry;

interface Harness {
  svc: DroidTickService;
  droid: ShipState;
  target: ShipState;
  /** Mines that actually reached the registry — real state, not a call count. */
  minesLaid: Array<{ deployedBy: string }>;
  /** Drain the microtask queue so `layMine`'s promise chain has run. */
  settle: () => Promise<void>;
}

/**
 * A Droid that has been shot at. Fight-back needs BOTH `cantexit > 0` and
 * `lastfired` pointing at the attacker's CHANNEL (GEDROIDS.C:443 for the
 * Vakory, :338 for the Murdonian); the tests set them explicitly rather than
 * relying on a prior hit, so each case starts from a stated state.
 */
function buildHarness(droidOver: Partial<ShipState>, target: ShipState): Harness {
  const rand = { next: () => 0.99 } as unknown as Random;
  const events = new EventEmitter2();

  const droid = makeShip({
    userid: `${DROID_USERID_PREFIX}1`, shipno: 1, shipname: 'Vakory',
    shpclass: DROID_CLASS_VAKORY, status: 2, isEphemeral: true,
    topspeed: 4, phasr: 100, phasrtype: 1, damage: 0,
    cantexit: 5, lastfired: target.channel ?? 2, channel: 1,
    ...droidOver,
  });

  const shipMap = new Map<string, ShipState>();
  shipMap.set(`${droid.userid}:1`, droid);
  shipMap.set(`${target.userid}:${target.shipno}`, target);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (u: string, n: number) => shipMap.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(`${u}:${n}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: (s: ShipState) => shipMap.set(`${s.userid}:${s.shipno}`, s),
    removeFromGame: jest.fn(),
    size: () => shipMap.size,
    findByUserid: () => [],
  } as unknown as ShipStateService;

  const classCache = {
    get: () => CLASS_ENTRY,
    getMaxPhaser: () => 1,
    getMaxTons: () => 100,
    getMaxShields: () => 1,
    getScanRange: () => SCAN_RANGE,
  } as unknown as ShipClassCacheService;

  const minesLaid: Array<{ deployedBy: string }> = [];
  const mineRegistry = {
    add: (m: { deployedBy: string }) => { minesLaid.push(m); },
    hydrate: jest.fn(),
  } as unknown as MineRegistry;
  const mineRepo = {
    create: (args: { deployedBy: string }) => Promise.resolve({ id: 1, ...args }),
  } as unknown as MineRepository;

  const svc = new DroidTickService(
    { subscribe: jest.fn() } as unknown as TickService,
    shipState, classCache,
    new DroidSpawner(shipState, classCache, rand),
    mineRegistry, mineRepo,
    events, rand,
  );

  return {
    svc, droid, target, minesLaid,
    settle: () => new Promise<void>((resolve) => setImmediate(resolve)),
  };
}

function act12(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass12: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass12(droid, players, SCAN_RANGE, 1);
}

function act11(svc: DroidTickService, droid: ShipState, players: ShipState[]): void {
  (svc as unknown as {
    actClass11: (d: ShipState, p: ShipState[], r: number, t: number) => boolean;
  }).actClass11(droid, players, SCAN_RANGE, 1);
}

/** Torpedoes queued onto the victim by the Droid. */
function torpedoesOn(target: ShipState): number {
  return target.ltorpsChannel.filter((c) => c !== undefined && c !== 255).length;
}

describe('a jammed Droid runs and does not fight back', () => {
  /**
   * `if (ptr->jammer == 0) { ...whole brain... } else { flee }` — the jam check
   * wraps EVERYTHING, so a jammed Droid never scans, never fires, never lays a
   * mine. It runs at `topspeed * 1000` on a hold-course of `gernd()%50 + 10`.
   *
   * This is what a player buys with a jammer: not less damage, but a Droid that
   * stops shooting entirely. If the port took the fight-back path anyway, the
   * item would be worthless credits and the player would keep taking fire from
   * a target they believed they had blinded.
   *
   * @see GEDROIDS.C:423, 524-527 (Vakory)
   */
  it('a jammed Vakory flees at top speed instead of firing', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 0.5, ycoord: 0 });
    const { svc, droid } = buildHarness({ jammer: 2, shieldstat: 0, speed2b: 0 }, target);

    act12(svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(target.shield).toBe(100);
    expect(torpedoesOn(target)).toBe(0);
    // topspeed 4 -> 4000; holdcourse floor(0.99*50)+10
    expect(droid.speed2b).toBe(4_000);
    expect(droid.holdcourse).toBe(59);
    // The early return happens before any shield command, so shields stay put.
    expect(droid.shieldstat).toBe(0);
    expect(droid.phasr).toBe(100);
  });

  /**
   * The same guard on the Murdonian Transport — the class a new player is
   * pointed at. @see GEDROIDS.C:315, 396-399
   */
  it('a jammed Murdonian flees at top speed instead of firing', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 0.5, ycoord: 0 });
    const { svc, droid } = buildHarness(
      { shpclass: DROID_CLASS_TRANSPORT, shipname: 'Murdonian', topspeed: 8, jammer: 2, shieldstat: 0 },
      target,
    );

    act11(svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(droid.speed2b).toBe(8_000);
    expect(droid.holdcourse).toBe(59);
    expect(droid.shieldstat).toBe(0);
    expect(droid.phasr).toBe(100);
  });
});

describe('hyperspace fire — firehp, and the range that stops it', () => {
  /**
   * `firehp` adds straight to the hull: `wptr->damage += (double)damage`
   * (GECMDS.C:1078). There is no `shieldhit` call anywhere in that function, so
   * raised shields absorb NOTHING from a hyper-phaser.
   *
   * This is the single most expensive branch in the file for a player. A pilot
   * who runs in hyperspace with shields up believes they are protected; canon
   * says the hit lands on the hull regardless. If the port ever routed the
   * hyper path through the shield branch, a Droid duel in hyperspace would
   * become unlosable and the class would stop being a threat.
   *
   * @see GEDROIDS.C:456-462, GECMDS.C:1042-1085
   */
  it('a hyper-phaser hit goes to the hull with the shields still up', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2,
      xcoord: 1.0, ycoord: 0, where: 1, shieldstat: 1, shield: 100,
    });
    const { svc, droid } = buildHarness({ where: 1 }, target);

    act12(svc, droid, [target]);

    expect(target.damage).toBeGreaterThan(0);
    // Untouched: firehp never calls shieldhit.
    expect(target.shield).toBe(100);
    expect(target.shieldstat).toBe(1);
    // The victim is battle-locked by the hit — this is what blocks `repair`.
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
    // The bank is spent whether or not the beam connected.
    expect(droid.phasr).toBe(0);
    expect(droid.cantexit).toBe(FIRETICKS);
  });

  /**
   * `firehp` checks the FIRER's own scanner before applying damage:
   * `if (ddistance < (double)shipclass[ptr->shpclass].scanrange)`
   * (GECMDS.C:1054). The Vakory's scanner is 25000 (MBMGESHP.MSG:7482) while
   * the decision tree's hyper gate is the flat 30000 of GEDROIDS.C:458, so the
   * band between them is a real, reachable hole: the brain says fire, the
   * primitive says the target is out of scanner range and nothing lands.
   *
   * If this gate were missing, a Vakory would reach a hyperspace runner 0.5
   * sectors beyond anything it can see — and hyper damage bypasses shields, so
   * it would be free hull damage from an invisible attacker.
   */
  it('a hyper-phaser beyond the class scan range does nothing, even inside the 30000 gate', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2,
      xcoord: 2.7, ycoord: 0, where: 1, shieldstat: 0,
    });
    const { svc, droid } = buildHarness({ where: 1 }, target);

    // 27000 raw: under the 30000 fight-back gate, over the 25000 scanner.
    expect(target.xcoord * SECTOR).toBeGreaterThan(SCAN_RANGE);
    expect(target.xcoord * SECTOR).toBeLessThan(30_000);

    act12(svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(target.lastfired).toBe(-1);
    expect(target.cantexit).toBe(0);
    // The refusal is before the bank is spent — the charge is still there.
    expect(droid.phasr).toBe(100);
  });
});

describe('normal-space fire — firep, and what shields do to it', () => {
  /**
   * `firep` branches solely on `wptr->shieldstat != SHIELDUP` (GECMDS.C:986);
   * the SHIELDUP arm never touches `wptr->damage`. Shields absorb the hit
   * WHOLE — the charge falls, the hull does not.
   *
   * Get this backwards in either direction and a fight changes outcome: leak
   * hull damage through raised shields and a player dies in a fight they had
   * won; send hull damage to the shields when they are down and nothing can
   * ever kill anyone.
   *
   * @see GEDROIDS.C:466-471, GECMDS.C:975-999
   */
  it('shields up: the charge falls and the hull is untouched', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2,
      xcoord: 0.5, ycoord: 0, shieldstat: 1, shield: 100, shieldtype: 2,
    });
    const { svc, droid } = buildHarness({}, target);

    act12(svc, droid, [target]);

    expect(target.damage).toBe(0);
    expect(target.shield).toBeLessThan(100);
    // A charge this healthy is only knocked down, never blown into SHIELDDM.
    expect(target.shieldstat).toBe(1);
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
  });

  it('shields down: the hull takes it and the charge is untouched', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2,
      xcoord: 0.5, ycoord: 0, shieldstat: 0, shield: 100, shieldtype: 2,
    });
    const { svc, droid } = buildHarness({}, target);

    act12(svc, droid, [target]);

    expect(target.damage).toBeGreaterThan(0);
    expect(target.shield).toBe(100);
    expect(target.shieldstat).toBe(0);
    expect(target.lastfired).toBe(droid.channel);
    expect(target.cantexit).toBe(FIRETICKS);
  });
});

describe('the Vakory manages its own shields by speed while fighting', () => {
  /**
   * `if (ptr->speed < 1000.0) shieldup(ptr,usrn); else shielddn(ptr,usrn);`
   * inside the fight-back block, AFTER the weapons and the evades
   * (GEDROIDS.C:504-507). Canon drops the shields at warp because a shielded
   * ship cannot run — the Droid chooses speed over protection above warp 1.
   *
   * Both cases put the attacker BEYOND the 25000 scanner so the detection loop
   * never runs and cannot set the shield command itself; the only thing that
   * can move `shieldstat` here is the fight-back rule under test.
   */
  it('at warp it drops the shields to run', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const { svc, droid } = buildHarness({ speed: 5_000, shieldstat: 1 }, target);

    act12(svc, droid, [target]);

    expect(droid.shieldstat).toBe(0);
  });

  it('at sub-warp speed it raises them', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const { svc, droid } = buildHarness({ speed: 0, shieldstat: 0 }, target);

    act12(svc, droid, [target]);

    expect(droid.shieldstat).toBe(1);
  });
});

describe('missile evade', () => {
  /**
   * `if (missl_attached(ptr,usrn)) { ptr->speed2b = rndm(5900.0)+5000.0;
   * ptr->holdcourse = gernd()%5 + 5; }` — GEDROIDS.C:498-502. A locked missile
   * makes the Vakory sprint into the 5000-10900 band and hold that course,
   * trying to outrun the missile's fuel.
   *
   * This is the branch that decides whether a player's missile connects. If it
   * never fired, missiles would be a guaranteed hit on a Droid and the item
   * would be mispriced; if it fired without a missile attached, the Droid would
   * randomly bolt mid-fight and be impossible to hold in a phaser arc.
   *
   * `missl_attached` reads the missile SLOT distance, not the launcher — a
   * missile already in flight toward the Droid.
   */
  it('a missile in flight sends the Vakory into the evade band', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const { svc, droid } = buildHarness(
      { speed2b: 123, lmisslDistance: [4_000, 0, 0], damage: 10 },
      target,
    );

    act12(svc, droid, [target]);

    // 0.99*5900 + 5000, and gernd()%5 + 5 with the same 0.99 draw.
    expect(droid.speed2b).toBeCloseTo(10_841, 3);
    expect(droid.holdcourse).toBe(9);
  });

  it('with no missile attached the Vakory holds its vector', () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const { svc, droid } = buildHarness(
      { speed2b: 123, lmisslDistance: [0, 0, 0], damage: 10 },
      target,
    );

    act12(svc, droid, [target]);

    expect(droid.speed2b).toBe(123);
    expect(droid.holdcourse).toBe(0);
  });
});

describe('the >75% damage flee — mine, jammer, run', () => {
  /**
   * A Vakory past 75% damage lays a mine, deploys a jammer and runs:
   *
   *   if (ptr->damage > 75) {
   *     if (ptr->items[I_MINE] > 0)    laymine(ptr,usrn,10);
   *     if (ptr->items[I_JAMMERS] > 0) jam(ptr,usrn);
   *     ptr->speed2b = topspeed*1000; ptr->head2b = rndm(359.9);
   *     ptr->holdcourse = gernd()%30 + 20;
   *   }
   *
   * GEDROIDS.C:509-521. Each item is spent only if it is carried — and the
   * mine is the part that costs a player their ship: a pursuing pilot chasing a
   * fleeing Droid runs over a live mine on the Droid's last position, with a
   * fuse of 10 (`laymine(ptr,usrn,10)`, GEDROIDS.C:512).
   *
   * This case also pins the ORDER the port applies things in: the flee's
   * `speed2b` is written last and therefore overrides the missile evade set
   * moments earlier, which matches canon's straight-line order.
   */
  it('a crippled Vakory carrying both drops a mine, jams, and runs', async () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const items = new Array(14).fill(0n) as bigint[];
    items[I_MINE] = 2n;
    items[I_JAMMER] = 1n;
    const h = buildHarness({ damage: 80, items, speed2b: 123 }, target);

    act12(h.svc, h.droid, [target]);
    await h.settle();

    expect(h.minesLaid).toHaveLength(1);
    expect(h.minesLaid[0].deployedBy).toBe(h.droid.userid);
    expect(h.droid.items[I_MINE]).toBe(1n);

    expect(h.droid.jammer).toBe(JAMTIME);
    expect(h.droid.items[I_JAMMER]).toBe(0n);

    // topspeed 4 -> 4000; head2b = 0.99*359.9; holdcourse = floor(0.99*30)+20
    expect(h.droid.speed2b).toBe(4_000);
    expect(h.droid.head2b).toBeCloseTo(356.301, 3);
    expect(h.droid.holdcourse).toBe(49);
  });

  /**
   * Same damage, empty magazine. Canon guards each item individually, so an
   * unarmed Vakory still runs — it just leaves nothing behind. A port that
   * laid a mine it did not carry would put a free, invisible kill in the
   * player's path; one that refused to flee without a mine would hand the
   * player a stationary kill it should have escaped.
   */
  it('a crippled Vakory with an empty magazine still runs, but leaves nothing behind', async () => {
    const target = makeShip({ userid: 'p1', shipno: 2, channel: 2, xcoord: 3, ycoord: 0 });
    const h = buildHarness(
      { damage: 80, items: new Array(14).fill(0n) as bigint[], speed2b: 123 },
      target,
    );

    act12(h.svc, h.droid, [target]);
    await h.settle();

    expect(h.minesLaid).toHaveLength(0);
    expect(h.droid.items[I_MINE]).toBe(0n);
    expect(h.droid.jammer).toBe(0);
    expect(h.droid.speed2b).toBe(4_000);
    expect(h.droid.holdcourse).toBe(49);
  });
});

describe('the Murdonian chooses between hyperspace escape and shields', () => {
  /**
   * The class 11 tail is an either/or:
   *
   *   if (ptr->where == 1) { if (missl_attached(...)) { speed2b = rndm(999.0);
   *                                                     holdcourse = ...; } }
   *   else shieldup(ptr,usrn);
   *
   * GEDROIDS.C:384-393. In hyperspace a Murdonian evades and does NOT raise
   * shields; in normal space it raises them and does not evade. Collapsing the
   * two would either leave a hyperspace Murdonian shielded and slow — a free
   * kill for the player — or leave a normal-space one unshielded, which turns
   * the game's designated starter target into a pushover and moves the whole
   * early economy.
   *
   * The attacker sits at 4 sectors here, past both the 25000 scanner and the
   * 30000 hyper gate, so nothing fires and the tail is the only thing acting.
   */
  it('in hyperspace with a missile attached it sprints and leaves the shields alone', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 4, ycoord: 0, where: 1,
    });
    const { svc, droid } = buildHarness(
      {
        shpclass: DROID_CLASS_TRANSPORT, shipname: 'Murdonian', topspeed: 8,
        where: 1, shieldstat: 0, speed2b: 123, lmisslDistance: [4_000, 0, 0],
      },
      target,
    );

    act11(svc, droid, [target]);

    // rndm(999.0) with the 0.99 draw; holdcourse gernd()%15 + 5.
    expect(droid.speed2b).toBeCloseTo(989.01, 3);
    expect(droid.holdcourse).toBe(19);
    expect(droid.shieldstat).toBe(0);
  });

  it('in normal space it raises shields and holds its vector', () => {
    const target = makeShip({
      userid: 'p1', shipno: 2, channel: 2, xcoord: 4, ycoord: 0, where: 0,
    });
    const { svc, droid } = buildHarness(
      {
        shpclass: DROID_CLASS_TRANSPORT, shipname: 'Murdonian', topspeed: 8,
        where: 0, shieldstat: 0, speed2b: 123, lmisslDistance: [4_000, 0, 0],
      },
      target,
    );

    act11(svc, droid, [target]);

    expect(droid.shieldstat).toBe(1);
    expect(droid.speed2b).toBe(123);
  });
});
