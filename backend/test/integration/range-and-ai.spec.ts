/**
 * Range coherence + AI engagement integration test.
 *
 * Pins the behavioral contract for:
 *   1. Scan range — `inScanRange()` helper agrees with per-class scanRange values
 *      across the calibration grid (player + AI ship classes at varied distances).
 *   2. Weapon range — phaser fire gate respects firer's scanRange.
 *   3. AI engagement — Cybertron sees a player inside scanRange, acquires lock,
 *      rotates head2b toward player, sets speed2b > 0 (pursuit), and fires.
 *   4. Neutral zone — Cybertron does not acquire or fire on a target inside NZ.
 *
 * Lives next to the existing cybertron-tick.service.spec.ts harness pattern;
 * uses the same in-memory ShipState/ShipClassCache fakes, no Postgres,
 * no Socket.io, no Nest DI container.
 *
 * @see specs/022-fidelity-audit-v2/findings.md (range model)
 * @see ship-class-scanrange-pin.spec.ts (seed-value pin)
 */

import { Mulberry32Adapter } from '../../src/game/combat/random.port';
import { cdistance, inScanRange } from '../../src/game/combat/combat-math';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CybertronTickService } from '../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../src/game/cybertron/cybertron.repository';
import { DroidTickService } from '../../src/game/droid/droid-tick.service';
import { DroidSpawner } from '../../src/game/droid/droid-spawner';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { MineRepository } from '../../src/game/combat/mine.repository';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { COMBAT_PHASER_FIRED } from '../../src/game/combat/combat-events';
import { CYBERTRON_EVENT } from '../../src/game/cybertron/cybertron-events';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';
import {
  DROID_CLASS_TRANSPORT,
  DROID_SPAWN_TICK_CADENCE,
  GESTAT_USER,
} from '../../src/game/constants';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeShip(o: Partial<ShipState> & { userid: string; shipno: number; shpclass: number }): ShipState {
  return {
    shipname: 'T', heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 50000, phasr: 100, phasrtype: 2,
    kills: 0, lastfired: 255, shieldtype: 2, shieldstat: 1, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 10n, 10n, 0n, 0n, 0n, 10n, 0n, 5n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0,
    destruct: 0, status: 1, cybmine: 255, cybskill: 10, cybupdate: 50, tick: 1,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false, dirty: false,
    ...o,
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and
    // victim by giving each a distinct shipno, so mirror it into channel.
    channel: o.channel ?? o.shipno ?? 1,
  };
}

function classCacheEntry(c: typeof SHIP_CLASSES[number]) {
  return {
    maxAcceleration: c.maxAcceleration,
    maxWarp: c.maxWarp,
    maxPhaser: c.maxPhaser,
    maxShields: c.maxShields,
    scanRange: c.scanRange,
    maxTons: c.maxTons,
    hasTorpedo: c.hasTorpedo,
    hasMissile: c.hasMissile,
    hasJammer: c.hasJammer,
    hasMine: c.hasMine,
    hasZipper: c.hasZipper,
    noClaim: c.noClaim,
    tough: c.tough,
    cybLowestClassAttacks: c.cybLowestClassAttacks,
    cybCanAttack: c.cybCanAttack,
  };
}

function buildCybertronHarness(seed = 42) {
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
    size: () => shipMap.size,
  } as unknown as ShipStateService;

  const classCache = new Map<number, ReturnType<ShipClassCacheService['get']>>();
  for (const c of SHIP_CLASSES) classCache.set(c.classNumber, classCacheEntry(c) as never);
  const shipClassCache = {
    get: (n: number) => classCache.get(n),
    // Canon dispatches AI behaviour by CLASS (GEMAIN.C:878-895); a droid never
    // runs cyb_lives. These harnesses only ever hold CYBORG classes.
    getCategory: (n: number) => (classCache.has(n) ? 'CPU_COMBATIVE' : undefined),
    // cybFirePhaser now feeds victimMaxTons into phaserDamage — the production
    // ShipClassCacheService exposes getMaxTons; the fake must too or cybLives throws.
    getMaxTons: (n: number) => (classCache.get(n) as { maxTons: number })?.maxTons ?? 5000,
  } as unknown as ShipClassCacheService;

  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn().mockResolvedValue(undefined),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => (n > 2_000_000n ? 2_000_000n : n),
  } as unknown as CybertronRepository;

  const subscribed: Array<(ctx: unknown) => void> = [];
  const tickService = {
    subscribe: (_k: unknown, fn: (ctx: unknown) => void) => { subscribed.push(fn); return () => {}; },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  svc.onModuleInit();

  function fireTick(n = 1) {
    for (let i = 0; i < n; i++) {
      for (const fn of subscribed) fn({ kind: 'PHYSICS', tickNumber: i + 1, firedAt: new Date() });
    }
  }

  return { svc, shipMap, events, fireTick, shipStateService };
}

// ─── 1. Scan matrix ──────────────────────────────────────────────────────────

describe('Range model — inScanRange agrees with per-class scanRange', () => {
  // The boundary is DERIVED from each class's own scanRange rather than
  // hardcoded: these numbers previously had to be hand-edited on every
  // rebalance, and the point of the test is that inScanRange agrees with
  // scanRange / 10_000 — not that any particular class has any particular reach.
  const cases: Array<{ classNumber: number; nick: string }> = [
    { classNumber: 1, nick: 'Interceptor' },
    { classNumber: 4, nick: 'Destroyer' },
    { classNumber: 8, nick: 'Dreadnought' },
    { classNumber: 21, nick: 'Cybertron Scout' },
    { classNumber: 23, nick: 'Cybertron Base Star' },
    { classNumber: 31, nick: 'Lydorian Garbage Scow' },
    { classNumber: 32, nick: 'Murdonian Transport' },
    { classNumber: 33, nick: 'Vakory Survey Drone' },
  ];

  for (const { classNumber, nick } of cases) {
    const cls = SHIP_CLASSES.find((c) => c.classNumber === classNumber)!;
    const sectors = cls.scanRange / 10_000;
    const observer = { xcoord: 5, ycoord: 5 };

    test(`${nick} (class ${classNumber}) sees targets just inside ${sectors} sectors`, () => {
      const justInside = { xcoord: 5 + sectors * 0.99, ycoord: 5 };
      expect(inScanRange(observer, justInside, cls.scanRange)).toBe(true);
    });

    test(`${nick} (class ${classNumber}) does NOT see targets just outside ${sectors} sectors`, () => {
      const justOutside = { xcoord: 5 + sectors * 1.01, ycoord: 5 };
      expect(inScanRange(observer, justOutside, cls.scanRange)).toBe(false);
    });

    test(`${nick} (class ${classNumber}) cdistance × 10_000 matches scanRange at the boundary`, () => {
      const atBoundary = { xcoord: 5 + sectors, ycoord: 5 };
      // The bridge: cdistance returns sector-units, scanRange is in raw units (×10_000)
      expect(cdistance(observer, atBoundary) * 10_000).toBeCloseTo(cls.scanRange, 5);
    });
  }

  test('the DEPLOYED galaxy is large enough that no weapon reach dominates it', () => {
    // Reads config/game.config.json rather than the runtime UNIVMAX, because
    // the test run deliberately shrinks the galaxy for speed
    // (test/helpers/test-galaxy-size.ts). The property being guarded is about
    // the world we actually ship, so it must be measured against that value.
    //
    // The previous bound divided by 30 and called it "the map width". 30 is
    // MAXX, the width of the ASCII sca-lo projection GRID - a fixed 30x15
    // viewport - not the size of the galaxy. Conflating the two capped every
    // weapon gate at 7.5 sectors, which canon exceeds almost everywhere (the
    // Dreadnought alone reaches 50), so the bound only held while the ship
    // table was compressed to fit it.
    //
    // Canon scan ranges are absolute, and UNIVMAX is a sysop option, so the
    // two must be chosen together: at canon's UNIVMAX=300 a Dreadnought's 50
    // sectors is 8% of the galaxy, but drop UNIVMAX far enough and the same
    // ship scans the entire world. This is the guard on that coupling.
    //
    // The Sysopian Death Star (class 41, admin-only, warp 255, canon scan 1m
    // = a 100-sector radius) is deliberately god-tier - exempt.
    // The file groups options into sections ("weapons", "galaxy", ...), so the
    // lookup walks one level rather than assuming a section name.
    const deployed = JSON.parse(
      readFileSync(resolve(__dirname, '../../config/game.config.json'), 'utf8'),
    ) as Record<string, unknown>;
    let univmax: number | undefined;
    for (const section of Object.values(deployed)) {
      if (section && typeof section === 'object' && 'UNIVMAX' in section) {
        univmax = (section as Record<string, number>).UNIVMAX;
        break;
      }
    }
    expect(typeof univmax).toBe('number');

    const galaxyWidthSectors = 2 * univmax! + 1;
    const maxGateSectors = galaxyWidthSectors / 4;
    for (const c of SHIP_CLASSES.filter((x) => x.classNumber !== 41)) {
      expect(c.scanRange / 10_000).toBeLessThanOrEqual(maxGateSectors);
    }
  });

  test('every player-tier ship can see across its own sector', () => {
    // The floor that matters is being able to detect a threat sharing your
    // sector: a sector is 1x1, so a radius of 0.5 reaches any point of it from
    // the centre. The previous bound of a full sector was fitted to the round-2
    // values and would now exclude the Heavy Freighter at 0.75.
    //
    // Canon deliberately makes the Heavy Freighter the blind spot — 50 000
    // against the Interceptor's 100 000, the only player class below it — so
    // preserving that ratio is the point of the proportional rescale, not a
    // regression.
    for (const c of SHIP_CLASSES.filter((x) => x.category === 'PLAYER')) {
      expect(c.scanRange / 10_000).toBeGreaterThanOrEqual(0.5);
    }
  });

  test('combative AI scanRange gates ENGAGEMENT only, never pursuit', () => {
    // This guard used to require every combative AI to see at least 0.3
    // sectors, on the stated premise that "an AI must be able to detect
    // something beyond the sector it occupies, so it can acquire a target that
    // wanders in". That premise is wrong, and it outlived the x0.15 rescale it
    // was written for.
    //
    // The original runs TWO separate loops and only one of them is ranged:
    //   - target selection, GECYBS.C:711-728 - loops every terminal and takes
    //     the closest passing (in game, not cloaked, lta <= shpclass,
    //     notclaimed). There is NO distance gate. Pursuit is galaxy-wide.
    //   - engagement,       GECYBS.C:249-252 - fires only while
    //     ddist < shipclass[hunter].scanrange.
    //
    // So scanRange decides how close a Cybertron must get before it shoots,
    // not whether it can find you. Canon gives the Cyberquad (class 22) a
    // scanRange of 1_000 - a tenth of a sector - which is not an inert ship
    // but a point-blank brawler: it hunts you across the galaxy and opens fire
    // only once it is on top of you. Pinning an arbitrary floor here would
    // silently overwrite that design.
    //
    // Field values themselves are owned by the canon conformance test.
    // @see test/balance/ship-class-canon.balance.spec.ts
    const combative = SHIP_CLASSES.filter((c) => c.classNumber >= 21 && c.classNumber <= 25);
    expect(combative).toHaveLength(5);

    // Engagement reach in sectors, straight from canon.
    const reach = Object.fromEntries(
      combative.map((c) => [c.classNumber, c.scanRange / 10_000]),
    );
    expect(reach).toEqual({
      21: 5,    // Cybertron Scout       - the picket, sees furthest for its size
      22: 0.1,  // Cyberquad             - point-blank brawler, tough=1
      23: 20,   // Cybertron Base Star   - immobile fortress, phaser 16
      24: 2,    // Sarten Attack Drone
      25: 40,   // Sarten Obliterator    - phaser 16, outranges everything
    });
  });
});

// ─── 2. AI engagement ────────────────────────────────────────────────────────

describe('Cybertron engagement — sees player, pursues, fires', () => {
  // Distances are expressed as a FRACTION of the Cybertron Scout's own
  // scanRange rather than in absolute sectors, so a rebalance does not silently
  // move every player out of range and turn these into no-ops.
  const SCOUT_SECTORS =
    SHIP_CLASSES.find((c) => c.classNumber === 21)!.scanRange / 10_000;

  function setup(playerDistanceSectors: number, seed = 99) {
    const h = buildCybertronHarness(seed);
    // Player at center
    const player = makeShip({
      userid: 'p1', shipno: 1, shpclass: 1, shipname: 'Player',
      xcoord: 15, ycoord: 7, status: 1, // ingame
    });
    // Cybertron offset by `playerDistanceSectors` to the east
    const cyb = makeShip({
      userid: 'Cybrg-001', shipno: 100, shpclass: 21, shipname: 'Cybertron 001',
      xcoord: 15 + playerDistanceSectors, ycoord: 7, status: 2, // GESTAT_AUTO
      tick: 1, // ready to act
    });
    h.shipMap.set('p1:1', player);
    h.shipMap.set('Cybrg-001:100', cyb);
    return { ...h, player, cyb };
  }

  test('Cybertron acquires lock on player inside its scanRange', () => {
    const { events, fireTick, cyb } = setup(SCOUT_SECTORS * 0.6);
    const acquired: unknown[] = [];
    events.on(CYBERTRON_EVENT.TARGET_ACQUIRED, (p) => acquired.push(p));
    fireTick(5);
    expect(cyb.cybmine).toBe(1); // shipno of player
    expect(acquired.length).toBeGreaterThanOrEqual(1);
  });

  test('Cybertron does NOT fire phasers on a player outside scanRange', () => {
    // The real gate is firing, not lock acquisition — cybCheckLockon picks the
    // *closest* player regardless of distance, so an out-of-range lock is
    // harmless. cybFirePhaser hits the inScanRange gate and must not emit.
    const { events, fireTick } = setup(SCOUT_SECTORS * 1.2, 33);
    const fires: unknown[] = [];
    events.on(COMBAT_PHASER_FIRED, (e) => fires.push(e));
    fireTick(20);
    expect(fires).toEqual([]);
  });

  test('Cybertron points head2b toward player on engagement', () => {
    const { fireTick, cyb } = setup(SCOUT_SECTORS * 0.8);
    fireTick(3);
    // Player is east of Cybertron → bearing should be ~270° (west, since target is at lower x)
    // dx = -2, dy = 0 → atan2(-2, 0) = -π/2 → -90° → 270°
    expect(cyb.head2b).toBeGreaterThan(180);
    expect(cyb.head2b).toBeLessThan(360);
  });

  test('Cybertron fires phasers at a player within scanRange', () => {
    const { events, fireTick, player } = setup(SCOUT_SECTORS * 0.5, 7);
    // kills > CYB_BE_NICE=30 → gebemean deterministically true (no PRNG roll needed),
    // matching the fidelity-fix in A-003 where the phaser gate now requires gebemean.
    player.kills = 50;
    const fires: unknown[] = [];
    events.on(COMBAT_PHASER_FIRED, (e) => fires.push(e));
    // Multiple ticks to allow cybwhoops misses; expect at least one fire over 20 ticks.
    fireTick(20);
    expect(fires.length).toBeGreaterThan(0);
  });

  test('Cybertron does NOT fire on a player INSIDE the neutral zone', () => {
    const h = buildCybertronHarness(123);
    // Player at origin (NZ)
    h.shipMap.set('p1:1', makeShip({
      userid: 'p1', shipno: 1, shpclass: 1, xcoord: 0, ycoord: 0, status: 1, shipname: 'P',
    }));
    h.shipMap.set('Cybrg-001:100', makeShip({
      userid: 'Cybrg-001', shipno: 100, shpclass: 21, xcoord: 1, ycoord: 1, status: 2,
      tick: 1, shipname: 'C',
    }));
    const fires: unknown[] = [];
    h.events.on(COMBAT_PHASER_FIRED, (e) => fires.push(e));
    h.fireTick(10);
    expect(fires.length).toBe(0);
  });

  test('Cybertron at far distance from a moving player can still catch up over multiple ticks', () => {
    // Regression for the playtest report: "AI did not even try". Cybertron Scout
    // scanRange 25_000 = 2.5 sectors. Player placed at 2.0 sectors → in range,
    // pickPursuitBand should set speed2b > 0 → physics will close the gap.
    const { fireTick, cyb } = setup(SCOUT_SECTORS * 0.8, 55);
    fireTick(3);
    expect(cyb.speed2b).toBeGreaterThan(0);
  });
});

// ─── 3. Murdonian reactive fightback ────────────────────────────────────────

describe('Murdonian (class 32) reactive fightback fires after a player hit', () => {
  function buildDroidHarness(seed = 42) {
    const rand = new Mulberry32Adapter(seed);
    const events = new EventEmitter2();
    const shipMap = new Map<string, ShipState>();

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

    const classCache = new Map<number, ReturnType<ShipClassCacheService['get']>>();
    for (const c of SHIP_CLASSES) classCache.set(c.classNumber, classCacheEntry(c) as never);
    const shipClassCache = {
      get: (n: number) => classCache.get(n),
      getScanRange: (n: number) => (classCache.get(n) as { scanRange: number })?.scanRange ?? 25_000,
      getMaxPhaser: (n: number) => (classCache.get(n) as { maxPhaser: number })?.maxPhaser ?? 5,
      getMaxShields: (n: number) => (classCache.get(n) as { maxShields: number })?.maxShields ?? 2,
      getMaxTons: (n: number) => (classCache.get(n) as { maxTons: number })?.maxTons ?? 5000,
    } as unknown as ShipClassCacheService;

    const mineRegistry = { add: jest.fn(), hydrate: jest.fn() } as unknown as MineRegistry;
    const mineRepo = {
      create: jest.fn().mockResolvedValue({ id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: '' }),
    } as unknown as MineRepository;

    const subscribed: Array<(ctx: unknown) => void> = [];
    const tickService = {
      subscribe: (_k: unknown, fn: (ctx: unknown) => void) => {
        subscribed.push(fn);
        return () => {};
      },
    } as unknown as TickService;

    const spawner = new DroidSpawner(shipState, shipClassCache, rand);
    const svc = new DroidTickService(
      tickService, shipState, shipClassCache, spawner, mineRegistry, mineRepo, events, rand,
    );
    void svc.onModuleInit();

    async function fireTicks(n: number) {
      for (let i = 1; i <= n; i++) {
        for (const fn of subscribed) fn({ kind: TickKind.PHYSICS, tickNumber: i, firedAt: new Date() });
        await new Promise((r) => setImmediate(r));
      }
    }

    return { svc, shipMap, events, fireTicks };
  }

  it('emits COMBAT_PHASER_FIRED on next droid cadence when Murdonian has cantexit > 0 and lastfired set', async () => {
    const h = buildDroidHarness(42);

    // Player away from NZ so the player-online gate passes
    h.shipMap.set('player1:7', {
      ...emptyShip(),
      userid: 'player1', shipno: 7, shpclass: 1, shipname: 'Player',
      // `channel` is what attribution matches on — the harness writes straight
      // into shipMap, so nothing assigns one for us.
      channel: 7,
      xcoord: 10, ycoord: 7, status: GESTAT_USER,
    });

    // First cadence rollover spawns Murdonians at random positions
    await h.fireTicks(DROID_SPAWN_TICK_CADENCE);

    const droid = Array.from(h.shipMap.values()).find(
      (s) => s.shpclass === DROID_CLASS_TRANSPORT,
    );
    expect(droid).toBeDefined();

    // Move the Murdonian adjacent to the player and simulate the player having
    // just hit it (combat tick would set cantexit + lastfired on hit).
    // Offset is a FRACTION of the Murdonian's own scanRange: firePhaser is
    // gated on it (A-001), so a hardcoded 1-sector gap silently stops
    // exercising this path whenever the class is rebalanced.
    const murdonianSectors =
      SHIP_CLASSES.find((c) => c.classNumber === DROID_CLASS_TRANSPORT)!.scanRange / 10_000;
    droid!.xcoord = 10 + murdonianSectors * 0.5;
    droid!.ycoord = 7;
    droid!.cantexit = 5;
    // lastfired holds the firer's unique CHANNEL (this port's usrnum), not its
    // shipno — every player's first ship is shipno 1, so a shipno here would
    // point the droid at an arbitrary bystander. @see ShipChannelRegistry
    droid!.lastfired = 7;
    droid!.phasr = 100; // ensure above PMINFIRE
    droid!.where = 0;

    const fires: unknown[] = [];
    h.events.on(COMBAT_PHASER_FIRED, (e) => fires.push(e));

    // Next cadence rollover — Murdonian's actClass11 should resolve to fireMode='normal'
    // and DroidTickService.firePhaser should emit COMBAT_PHASER_FIRED.
    await h.fireTicks(DROID_SPAWN_TICK_CADENCE);

    expect(fires.length).toBeGreaterThan(0);
  });
});

function emptyShip(): Omit<ShipState, 'userid' | 'shipno' | 'shpclass'> {
  return {
    shipname: '', heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50_000, phasr: 100, phasrtype: 1,
    kills: 0, lastfired: 255, shieldtype: 2, shieldstat: 1, shield: 2, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 1, train: 0, where: 0,
    ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [],
    lmisslDistance: [], lmisslEnergy: [],
    decout: [0, 0, 0, 0, 0], jammer: 0, freq: [],
    items: Array(16).fill(0n) as bigint[], titem: 0, hostile: 0,
    cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: 1, cybmine: 255, cybskill: 0, cybupdate: 0, tick: 0,
    emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8_000, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false, dirty: false,
  };
}
