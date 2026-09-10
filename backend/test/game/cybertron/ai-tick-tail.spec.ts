/**
 * The one real decision left in the two AI brains: whether a Cybertron already
 * in hyperwarp opens fire on a player who is also in hyperwarp.
 *
 * Canon, GECYBS.C:268-280:
 *
 *   if (ptr->where == 1 && wptr->where == 1 && gebemean(ptr,zothusn)) {
 *       if (ddist < (tooclose+rndm(tooclose)) || cybs_can_att
 *           || wptr->cantexit > 0 || ptr->cantexit > 0) {
 *           if (ddist < 30000.0) {
 *               ptr->degrees = cbearing(...);
 *               firehp(ptr,usrn);
 *           }
 *       }
 *   }
 *
 * Four independent ways in, and the port has been wrong about two of them
 * before: the random widening of `tooclose` and the ATTACKER's own battle-lock
 * (`ptr->cantexit`) were both missing, so a Cybertron that had just been shot
 * at let its attacker run. Each disjunct therefore gets its own case, entered
 * through the REAL entry point — the SHIP_UPDATE tick handler this service
 * registers in onModuleInit — rather than by reaching into a private method,
 * so the `cybLives -> runEngagementScan` chain that gates it is exercised too.
 *
 * The observable is `cyb.phasr`: `cybFireHyperPhaser` ends with `ptr->phasr = 0`
 * whether or not the beam connects (GECMDS.C:1083), so it separates "fired" from
 * "declined" without depending on the hit geometry, and the victim's `damage`
 * confirms the shot actually landed.
 *
 * ── What this file deliberately does NOT test, and why ────────────────────────
 * Both AI tails are almost entirely defence-in-depth duplicates of a gate the
 * only caller has already applied. Each of the following is unreachable from
 * any real entry point; see the summary in the round-four report:
 *
 *   droid-tick.service.ts 177   `!pop` — livePopulation is seeded with all three
 *                               DROID_CLASSES at construction and only userids
 *                               are ever deleted from it, never a class key.
 *   droid-tick.service.ts 425/426/435/475
 *                               firePhaser's phasr/cloak/scanRange/hyperspace
 *                               gates. `fireMode='normal'` is only ever set by
 *                               droidActClass11/12 under
 *                               `droid.phasr >= PMINFIRE && cloak !== 10 &&
 *                               ddist < scanRange`, and only in the branch that
 *                               requires the target NOT to be in hyperspace, so
 *                               aiCanHitTarget cannot return false either.
 *   droid-tick.service.ts 545   `ddist >= fightbackHyperspaceMaxDist`.
 *                               `fireMode='hyper'` requires `ddist < 30_000` and
 *                               the config default IS 30_000.
 *   droid-tick.service.ts 639/668
 *                               layMine/deployJammer empty-magazine guards. The
 *                               class-12 decision only sets `layMine`/
 *                               `deployJammer` when `items[I_MINE] > 0` /
 *                               `items[I_JAMMER] > 0`.
 *   droid-tick.service.ts 676   `command === undefined`. Class 10 always returns
 *                               a 1|0; classes 11 and 12 are called behind
 *                               `!== undefined` at the call site.
 *   droid-tick.service.ts 707   `!event` on an @OnEvent payload every emitter
 *                               builds as an object literal.
 *   droid 454 / 572, cybertron 579 / 1065
 *                               optional-dependency guards (`@Optional()`
 *                               combatTick, mineRegistry, mineRepo) — excluded
 *                               by docs/TEST_STRATEGY.md.
 *   cybertron 399 / 805 / 957   `'tickNumber' in ctx ? ... : 0`. TickContext
 *                               declares tickNumber as required and every caller
 *                               is the tick dispatcher.
 *   cybertron 534 / 542         cybFirePhaser's PMINFIRE and scanRange gates.
 *                               cybAttack already tests `phasr >= PMINFIRE`, and
 *                               runEngagementScan already dropped anything with
 *                               `ddist > scanRange` computed from the same
 *                               cache entry.
 *   cybertron 1118 / 1120       colon/NaN parsing of `attackerShipKey`, which is
 *                               produced by `shipKey(userid, shipno)`.
 *   cybertron 1191              `!config` in spawnOne; both callers pass a key
 *                               taken from classConfigs itself.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickHandler, TickKind } from '../../../src/game/tick/tick.types';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { GESTAT_AUTO, GESTAT_USER, TOOCLOSE, CYB_BE_NICE,
  HPMINFIR,
} from '../../../src/game/constants';

/** `where === 1` is hyperspace. */
const HYPER = 1;
const NORMAL = 0;
/** Cybertron Scout — a class with `tough` 0, so no break-off roll is consumed. */
const CYB_CLASS = 21;

/** A PRNG that always answers the same number — the rolls stay arithmetic. */
class FixedRandom implements Random {
  constructor(private readonly value: number) {}
  next(): number {
    return this.value;
  }
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 25_000, speed2b: 25_000,
    xcoord: 20, ycoord: 20, damage: 0, energy: 500_000,
    phasr: 500, phasrtype: 5, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: HYPER, ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_USER, cybmine: 255,
    cybskill: 10, cybupdate: 50, tick: 1, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 30, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

interface Scenario {
  /** Sectors between the two ships on the x axis — ddist is this × 10_000. */
  gapSectors: number;
  /** `cybs_can_att` for the prey's class. */
  cybCanAttack: boolean;
  /** `ptr->cantexit` — the Cybertron's own battle lock. */
  cybCantexit: number;
  /** `wptr->cantexit` — the prey's battle lock. */
  preyCantexit: number;
  /** Kills on the prey's record; > CYB_BE_NICE makes `gebemean` unconditional. */
  preyKills: number;
  /** The Cybertron's flux. `firehp` does nothing below HPMINFIR. */
  cybEnergy: number;
  /** The prey's `where`; canon requires hyperspace at BOTH ends. */
  preyWhere: number;
  /** Every roll answers this. */
  roll: number;
}

const BASE: Scenario = {
  gapSectors: 1,
  cybCanAttack: false,
  cybCantexit: 0,
  preyCantexit: 0,
  preyKills: CYB_BE_NICE + 1,
  preyWhere: HYPER,
  roll: 0.5,
  cybEnergy: 60_000,
};

/**
 * Builds the service, registers it the way Nest does, and runs exactly one
 * SHIP_UPDATE tick.
 */
async function runOneAiTick(over: Partial<Scenario> = {}): Promise<{ cyb: ShipState; prey: ShipState }> {
  const s: Scenario = { ...BASE, ...over };

  const cyb = makeShip({
    userid: 'Cybrg-200', shipno: 200, shipname: 'Cybrg-200', channel: 200,
    shpclass: CYB_CLASS, status: GESTAT_AUTO, where: HYPER,
    xcoord: 20, ycoord: 20, heading: 0,
    phasr: 500, phasrtype: 5, cantexit: s.cybCantexit,
    energy: s.cybEnergy,
    cybmine: 255, cybupdate: 50, holdcourse: 0, jammer: 0, tick: 1,
  });
  const prey = makeShip({
    userid: 'p1', shipno: 1, shipname: 'Prey', channel: 1,
    status: GESTAT_USER, where: s.preyWhere,
    xcoord: 20 + s.gapSectors, ycoord: 20,
    kills: s.preyKills, cantexit: s.preyCantexit,
  });

  const map = new Map<string, ShipState>([
    [shipKey(cyb.userid, cyb.shipno), cyb],
    [shipKey(prey.userid, prey.shipno), prey],
  ]);
  const shipState = {
    findAllShips: () => Array.from(map.values()),
    get: (u: string, n: number) => map.get(shipKey(u, n)),
    mutate: (u: string, n: number, fn: (v: ShipState) => void) => {
      const v = map.get(shipKey(u, n));
      if (v) { fn(v); v.dirty = true; }
      return v;
    },
    loadShip: (v: ShipState) => map.set(shipKey(v.userid, v.shipno), v),
    removeFromGame: (v: { userid: string; shipno: number }) => map.delete(shipKey(v.userid, v.shipno)),
    size: () => map.size,
  } as unknown as ShipStateService;

  const cybEntry = {
    maxAcceleration: 5_000, maxWarp: 30, maxPhaser: 10, maxShields: 2,
    scanRange: 400_000, maxTons: 1_000, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: false, points: 1, canAttackPlanet: false, damageFactor: 100,
    typeName: 'Cyb', category: 'CPU_COMBATIVE', shipNameTemplate: '',
  };
  // `cybs_can_att` is read from the TARGET's class row (GECYBS.C:270).
  const preyEntry = { ...cybEntry, category: 'PLAYER', cybCanAttack: s.cybCanAttack };
  const entryFor = (shpclass: number) => (shpclass === CYB_CLASS ? cybEntry : preyEntry);

  const shipClassCache = {
    get: (shpclass: number) => entryFor(shpclass),
    getCategory: (shpclass: number) => entryFor(shpclass).category,
    getMaxPhaser: (shpclass: number) => entryFor(shpclass).maxPhaser,
    getMaxShields: (shpclass: number) => entryFor(shpclass).maxShields,
    getMaxTons: (shpclass: number) => entryFor(shpclass).maxTons,
    getScanRange: (shpclass: number) => entryFor(shpclass).scanRange,
    getDamageFactor: (shpclass: number) => entryFor(shpclass).damageFactor,
    getHasTorpedo: () => false,
    getHasMissile: () => false,
    getHasCloak: () => false,
  } as unknown as ShipClassCacheService;

  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn(),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    creditAllowances: jest.fn().mockResolvedValue(undefined),
    incrementKills: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n,
  } as unknown as CybertronRepository;

  const handlers = new Map<TickKind, TickHandler[]>();
  const tickService = {
    subscribe: (kind: TickKind, fn: TickHandler) => {
      const list = handlers.get(kind) ?? [];
      list.push(fn);
      handlers.set(kind, list);
      return () => undefined;
    },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipState, shipClassCache, repository,
    new EventEmitter2(), new FixedRandom(s.roll),
  );
  await svc.onModuleInit();

  const ctx: TickContext = {
    kind: TickKind.SHIP_UPDATE,
    tickNumber: 1,
    firedAt: new Date('2026-09-10T00:00:00Z'),
  };
  for (const fn of handlers.get(TickKind.SHIP_UPDATE) ?? []) fn(ctx);

  return { cyb, prey };
}

/** `phasr` is zeroed by firehp whether or not the beam connects. */
/**
 * The hyper-phaser does NOT discharge the normal bank — canon's `firehp` never
 * touches `phasr`; it debits energy and arms the `hypha` cooldown instead
 * (GECMDS.C:1039-1041). Checking `phasr === 0` therefore tests the wrong
 * weapon, and writing it that way is what exposed the Cybertron path skipping
 * both charges. @see docs/PROGRESS.md 2026-09-10
 */
const fired = (cyb: ShipState): boolean => cyb.hypha === 1;

describe('Cybertron hyperspace engagement gate (GECYBS.C:268-280)', () => {
  const savedBootSeed = process.env.CYBERTRON_BOOT_SEED;

  beforeEach(() => {
    // Boot-seeding would fill the map with spawned hulls and drown the fixture.
    process.env.CYBERTRON_BOOT_SEED = 'false';
  });
  afterEach(() => {
    if (savedBootSeed === undefined) delete process.env.CYBERTRON_BOOT_SEED;
    else process.env.CYBERTRON_BOOT_SEED = savedBootSeed;
  });

  it('holds fire when none of canon\'s four conditions is met', async () => {
    // 1 sector = 10_000 raw, and the widened window tops out below
    // TOOCLOSE * 2 = 5_000, so the range disjunct is false for any roll.
    expect(TOOCLOSE * 2).toBeLessThan(10_000);

    const { cyb, prey } = await runOneAiTick();

    expect({ fired: fired(cyb), damage: prey.damage }).toEqual({ fired: false, damage: 0 });
  });

  /**
   * `firehp` is ENTIRELY inside `if (ptr->energy >= HPMINFIR)` (GECMDS.C:1029).
   * Below 6,000 flux nothing happens at all: no shot, no debit, no cooldown.
   * The player path honours this (phaser.handler.ts, "no fire, no debit"); the
   * Cybertron path had no gate, and the first attempt at charging it debited
   * unconditionally — which would have driven a low Cybertron's energy negative
   * and armed a cooldown for a shot it never took.
   */
  it('does not fire or arm the cooldown below HPMINFIR', async () => {
    // Energy is NOT asserted here: `cyb_lives` restores it to a flat 50,000 at
    // the END of every activation (GECYBS.C:325), after the engagement scan has
    // already run. So the debit is real within the tick and invisible after it,
    // and `hypha` plus the victim's hull are the observable signals.
    const { cyb, prey } = await runOneAiTick({ gapSectors: 0.2, cybEnergy: HPMINFIR - 1 });

    expect(fired(cyb)).toBe(false);
    expect(prey.damage).toBe(0);
  });

  it('fires at exactly HPMINFIR — the gate is >=, not >', async () => {
    const { cyb, prey } = await runOneAiTick({ gapSectors: 0.2, cybEnergy: HPMINFIR });

    expect(fired(cyb)).toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
  });

  it('fires when the player is inside tooclose', async () => {
    // `ddist < tooclose + rndm(tooclose)` — 0.2 sectors is 2_000, under the
    // 2_500 floor, so this disjunct alone carries the shot.
    const { cyb, prey } = await runOneAiTick({ gapSectors: 0.2 });

    expect(fired(cyb)).toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
  });

  it('fires at a class flagged cybs_can_att however far away it is', async () => {
    const { cyb, prey } = await runOneAiTick({ cybCanAttack: true });

    expect(fired(cyb)).toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
  });

  it('fires at a player who is already battle-locked (wptr->cantexit)', async () => {
    const { cyb, prey } = await runOneAiTick({ preyCantexit: 6 });

    expect(fired(cyb)).toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
  });

  it('fires when the CYBERTRON itself is battle-locked (ptr->cantexit)', async () => {
    // The disjunct the port was missing: a Cybertron that has just been shot at
    // must answer, at any range. Without it a pilot could hit one and outrun the
    // reply through hyperspace.
    const { cyb, prey } = await runOneAiTick({ cybCantexit: 6 });

    expect(fired(cyb)).toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
  });

  it('still refuses beyond 30_000 even when battle-locked', async () => {
    // `if (ddist < 30000.0)` sits INSIDE the four-way condition — passing the
    // condition is not permission to fire across the map.
    const { cyb, prey } = await runOneAiTick({ cybCantexit: 6, gapSectors: 4 });

    expect({ fired: fired(cyb), damage: prey.damage }).toEqual({ fired: false, damage: 0 });
  });

  it('does not fire when gebemean says no', async () => {
    // `gebemean` is a 1-in-CYBSLO roll for a target under CYB_BE_NICE kills and
    // a class that is not a Cyberquad. floor(0.9 * 3) = 2, so it declines —
    // even at point-blank range, where every other gate is open.
    const { cyb, prey } = await runOneAiTick({ preyKills: 0, gapSectors: 0.2, roll: 0.9 });

    expect({ fired: fired(cyb), damage: prey.damage }).toEqual({ fired: false, damage: 0 });
  });

  it('does not use the hyperspace branch on a player in normal space', async () => {
    // `ptr->where == 1 && wptr->where == 1`. A Cybertron in hyperwarp cannot
    // touch a ship in normal space, whatever the range.
    const { cyb, prey } = await runOneAiTick({ preyWhere: NORMAL, gapSectors: 0.2, cybCantexit: 6 });

    expect({ fired: fired(cyb), damage: prey.damage }).toEqual({ fired: false, damage: 0 });
  });
});
