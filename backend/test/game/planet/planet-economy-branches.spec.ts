/**
 * Two decision sets that move ships and planets, and that a coverage audit on
 * 2026-09-10 found sitting on unentered branches.
 *
 * PART ONE — `firehp`'s victim selection, through the real `pha` command.
 *
 *   for (othusn=0 ; othusn < nships ; othusn++) {
 *     wptr = warshpoff(othusn);
 *     if (ingegame(othusn) && wptr->where == 1) {
 *       if (othusn != usrn && !neutral(&wptr->coord)) {
 *         heading = vector(&ptr->coord,&wptr->coord);
 *         if (smallest(heading,deg) < HPBEAMW) {
 *           ddistance = cdistance(&ptr->coord,&wptr->coord)*10000;
 *           if (ddistance < shipclass[ptr->shpclass].scanrange) { ...damage... }
 *
 *   @see GECMDS.C:1041-1086 firehp
 *
 * Four gates, and every one of them decides whether a hull takes damage it
 * cannot shield against — `wptr->damage += damage` with no `shieldhit` call
 * anywhere on this path (GECMDS.C:1078). Getting `ingegame` wrong shoots a
 * logged-off shell; getting `!neutral` wrong shoots inside the one sector new
 * pilots are promised is safe; getting the scanrange test wrong turns the
 * hyper-phaser into an unlimited-range weapon; and getting the arc wrong makes
 * the fixed five-degree beam behave like the focusable one, which is precisely
 * the difference the function exists to express.
 *
 * These cases drive `PhaserHandlerService.command.handler` — the real player
 * path, which routes to `handleHyper` on `where === 1` (GECMDS.C:843) — and
 * assert the VICTIM'S HULL, not that a selector returned a list. `firehp.ts`
 * has two callers (the command and GECYBS.C:279's pursuit) and the port's bug
 * history here is a caller that never reached the shared code at all.
 *
 * PART TWO — `check_spy`'s reporting outcome, through `PlanetEconomyService`.
 *
 *   if (gernd()%10 == 0) { ...pick an item, deviate the count...
 *       prfmsg(SPYM2,plptr->name,xsect,ysect,odds,item_name[i],...);
 *       strcpy(mail.userid,plptr->spyowner); }        -- and NO spyowner reset
 *
 *   @see GEPLANET.C:149-186
 *
 * Canon clears `spyowner` on exactly two live outcomes — the planet's owner
 * turning out to BE the spy's master, GEPLANET.C:94
 * `plptr->spyowner[0] = 0;`, and the counter-spies catching the infiltrator at
 * GEPLANET.C:142 — and
 * pointedly not on a report, because filing reports is the whole reason the
 * item costs what it does. There is a third assignment at :101, but it sits
 * inside a commented-out `uidxst` block and never runs; the header used to
 * cite :113, which is the opening of a `/*DEBUG` comment and is not code at
 * all. The service's own comment records that this used to
 * be `if (outcome !== 'none') spyowner = ''`, which deleted a spy every time
 * one reported. The pure roll is covered by `spy-counter-espionage.spec.ts`;
 * what was NOT covered is the service branch that decides whether the spy
 * survives its own report, and the SPYM2 row's field layout, which is this
 * port's numbering and has to stay stable for the inbox to read it back.
 *
 * The last two cases pin the fire-and-forget contract on the mail inserts: a
 * planet still changes hands, and a spy still survives, when Postgres refuses
 * the letter. Those `.catch` arms are the difference between a logged error and
 * an economy tick that dies mid-sweep with an unhandled rejection.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhaserHandlerService } from '../../../src/game/commands/handlers/phaser.handler';
import type { CommandContext } from '../../../src/game/commands/command.types';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import { FREE_PLANET_OWNER } from '../../../src/game/planet/planet-economy';
import type { PlanetState } from '../../../src/game/planet/planet-state.types';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import type { Random } from '../../../src/game/combat/random.port';
import { GESTAT_AUTO, GESTAT_USER, MAIL_CLASS_DISTRESS } from '../../../src/game/constants';
import { I_FOOD, I_MEN, I_TROOPS, NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as buildShip } from '../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Part one — firehp, through `pha`
// ---------------------------------------------------------------------------

/** Interceptor-scale scanner: 1.5 sectors, in raw units. */
const SCAN_RANGE = 15_000;
/** Every victim is a 100-ton hull, so `tonfact` is a constant 1.00667. */
const VICTIM_MAX_TONS = 100;

// Local defaults layered on the shared factory: this suite's victim is
// in-flight (`where: 1`, hyperspace — firehp's own gate), a player hull
// (GESTAT_USER) that has never been fired on, with a full weapons rack of
// empty slots (channel 255).
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return buildShip({
    userid: 'p1',
    shipname: 'Victim',
    energy: 50_000,
    phasr: 100,
    phasrtype: 5,
    lastfired: -1,
    shieldtype: 2,
    shield: 2,
    where: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    freq: [],
    items: new Array(14).fill(0n) as bigint[],
    status: GESTAT_USER,
    cybmine: 255,
    tick: 6,
    topspeed: 8,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  });
}

/**
 * A point `dist` sectors from `from` on compass bearing `deg` (north=0,
 * clockwise), matching `withinArc`'s `atan2(dx, -dy)` convention: y grows
 * downward, so north is a SMALLER y.
 */
function atBearing(
  from: { xcoord: number; ycoord: number },
  deg: number,
  dist: number,
): { xcoord: number; ycoord: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    xcoord: from.xcoord + dist * Math.sin(rad),
    ycoord: from.ycoord - dist * Math.cos(rad),
  };
}

/**
 * The firer is in hyperspace (`where === 1`) with flux to spare and its
 * cooldown clear, which is what routes `pha` to `handleHyper` at all.
 */
function buildHyperHarness(firerOver: Partial<ShipState>, victims: ShipState[]) {
  const firer = makeShip({
    userid: 'attacker', shipno: 1, shipname: 'Raider', channel: 1,
    where: 1, energy: 50_000, hypha: 0, phasrtype: 5, cloak: 0,
    heading: 0, ...firerOver,
  });

  const ships = new Map<string, ShipState>();
  ships.set(`${firer.userid}:${firer.shipno}`, firer);
  for (const v of victims) ships.set(`${v.userid}:${v.shipno}`, v);

  const shipState = {
    findAllShips: () => Array.from(ships.values()),
    get: (u: string, n: number) => ships.get(`${u}:${n}`),
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => {
      const s = ships.get(`${u}:${n}`);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
  } as unknown as ShipStateService;

  const classCache = {
    getScanRange: () => SCAN_RANGE,
    getMaxTons: () => VICTIM_MAX_TONS,
    getMaxShields: () => 2,
    getMaxPhaser: () => 5,
    getHasTorpedo: () => false,
    getHasMissile: () => false,
    getHasCloak: () => false,
  } as unknown as ShipClassCacheService;

  // Fixed draw. `randamage` runs after every hit but returns 'none' below 21%
  // hull (GEFUNCS.C:1956), and every victim here starts undamaged — so the RNG
  // cannot alter what these cases assert whatever it draws.
  const random = { next: () => 0.99 } as unknown as Random;

  const svc = new PhaserHandlerService(shipState, classCache, new EventEmitter2(), random);
  return { svc, firer };
}

async function fire(svc: PhaserHandlerService, firer: ShipState, args: string[]): Promise<void> {
  await svc.command.handler(firer, args, {} as CommandContext);
}

describe('firehp victim selection, through the pha command (GECMDS.C:1041-1086)', () => {
  it('burns a ship that is in hyperspace, in the beam and in range', async () => {
    // 0.5 sectors dead ahead: dd = 1 - 5000/40000 = 0.875, dam = trunc(50 *
    // 0.875^5) = 25, factor = 25 * 5 / 1.00667 -> 124 hull. The baseline that
    // makes every "no damage" case below mean something.
    const at = atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 0.5);
    const victim = makeShip({ userid: 'v1', shipno: 2, channel: 2, where: 1, ...at });
    const { svc, firer } = buildHyperHarness({ xcoord: 5.5, ycoord: 5.5 }, [victim]);

    await fire(svc, firer, ['0']);

    expect(victim.damage).toBeGreaterThan(0);
  });

  it('skips a hull nobody is flying and still burns the AI beside it', async () => {
    // `ingegame(othusn)` — status 1 (player) or 2 (AI). A status-0 slot is a
    // ship record with no pilot behind it; canon never puts one in the loop.
    const ghost = makeShip({
      userid: 'ghost', shipno: 2, channel: 2, status: 0, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 0.5),
    });
    const cyb = makeShip({
      userid: 'cyb', shipno: 3, channel: 3, status: GESTAT_AUTO, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 0.4),
    });
    const { svc, firer } = buildHyperHarness({ xcoord: 5.5, ycoord: 5.5 }, [ghost, cyb]);

    await fire(svc, firer, ['0']);

    expect(ghost.damage).toBe(0);
    expect(cyb.damage).toBeGreaterThan(0);
  });

  it('passes straight through a ship in normal space', async () => {
    // `wptr->where == 1` (GECMDS.C:1045). The hyper-phaser is a hyperspace-only
    // weapon at BOTH ends; a ship in normal space is not in this fight, and a
    // firer at warp that could hit it would be untouchable while doing so.
    const normalSpace = makeShip({
      userid: 'v1', shipno: 2, channel: 2, where: 0,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 0.5),
    });
    const { svc, firer } = buildHyperHarness({ xcoord: 5.5, ycoord: 5.5 }, [normalSpace]);

    await fire(svc, firer, ['0']);

    expect(normalSpace.damage).toBe(0);
  });

  it('cannot reach into the neutral zone, while the ship just outside it burns', async () => {
    // `!neutral(&wptr->coord)` (GECMDS.C:1047). The zone is the WHOLE of sector
    // (0,0) — floor() on each axis, GECMDS.C:3102 — so these two victims are a
    // sixth of a sector apart with the sector line between them. The firer sits
    // at x=1.2 (sector 1) so its own self-zap gate does not abort the shot.
    const firerPos = { xcoord: 1.2, ycoord: 0.5 };
    const inside = makeShip({ userid: 'safe', shipno: 2, channel: 2, where: 1, xcoord: 0.9, ycoord: 0.5 });
    const outside = makeShip({ userid: 'exposed', shipno: 3, channel: 3, where: 1, xcoord: 1.05, ycoord: 0.5 });
    const { svc, firer } = buildHyperHarness({ ...firerPos, heading: 270 }, [inside, outside]);

    await fire(svc, firer, ['0']);

    expect(inside.damage).toBe(0);
    expect(outside.damage).toBeGreaterThan(0);
  });

  it('stops at the firer class scan range, though the damage curve has not', async () => {
    // `ddistance < shipclass[ptr->shpclass].scanrange` (GECMDS.C:1054) is the
    // range cap, and it bites well BEFORE the falloff does: at 2.0 sectors
    // dd = 1 - 20000/40000 = 0.5, dam = trunc(50 * 0.5^5) = 1, so 4 hull would
    // still land. An Interceptor scanner reaches 1.5 sectors, so it must not.
    const near = makeShip({
      userid: 'near', shipno: 2, channel: 2, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 0.5),
    });
    const far = makeShip({
      userid: 'far', shipno: 3, channel: 3, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 0, 2.0),
    });
    const { svc, firer } = buildHyperHarness({ xcoord: 5.5, ycoord: 5.5 }, [near, far]);

    await fire(svc, firer, ['0']);

    expect(near.damage).toBeGreaterThan(0);
    expect(far.damage).toBe(0);
  });

  it('keeps the fixed five-degree beam even at maximum focus', async () => {
    // `smallest(heading,deg) < HPBEAMW` — HPBEAMW is 5 and `ptr->percent` is
    // never read on this path (GECMDS.C:1050). The normal beam at focus 5 is
    // `focus + PHABIAS` = 7 degrees wide, so the ship at 6 degrees is inside
    // the widest ORDINARY shot and outside every hyper shot. If the arc ever
    // picks up the focus term, this is the case that notices.
    const inBeam = makeShip({
      userid: 'in', shipno: 2, channel: 2, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 3, 0.5),
    });
    const justOutside = makeShip({
      userid: 'out', shipno: 3, channel: 3, where: 1,
      ...atBearing({ xcoord: 5.5, ycoord: 5.5 }, 6, 0.5),
    });
    const { svc, firer } = buildHyperHarness({ xcoord: 5.5, ycoord: 5.5 }, [inBeam, justOutside]);

    await fire(svc, firer, ['0', '5']);

    expect(inBeam.damage).toBeGreaterThan(0);
    expect(justOutside.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Part two — the spy's report, and mail that will not insert
// ---------------------------------------------------------------------------

/** SPYM2, the operative's inventory report. This numbering is the port's. */
const MESG_SPYM2 = 35;

interface MailRow {
  userid: string;
  class: number;
  type: number;
  topic: string;
  name1: string;
  int1: number;
  int2: number;
  cash: bigint;
  debt?: bigint;
  tax?: bigint;
}

function makePlanet(over: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  return {
    xsect: 4, ysect: 9, plnum: 1, type: 2, xcoord: 4.5, ycoord: 9.5,
    userid: 'owner', name: 'Bastion', enviorn: 3, resource: 3,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0, password: '',
    lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items, ...over,
  };
}

/**
 * `gernd` is `floor(next * 65536)`, so a scripted `k / 65536` makes gernd
 * return exactly `k` — which is how the item-slot draw is aimed.
 */
const g = (k: number): number => k / 65536;

function buildEconomy(draws: number[], failInserts = false) {
  const created: MailRow[] = [];
  const create = vi.fn(async (arg: { data: MailRow }) => {
    created.push(arg.data);
    if (failInserts) throw new Error('mailStat insert rejected');
    return {};
  });
  const prisma = { mailStat: { create } } as unknown as PrismaService;
  let i = 0;
  const random = { next: () => draws[i++] ?? 0 } as unknown as Random;
  return { svc: new PlanetEconomyService(random, prisma), created, create };
}

/** Let the fire-and-forget inserts settle before asserting on them. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('a spy that files a report survives it (GEPLANET.C:149-186)', () => {
  /**
   * Draws in canon's order, with no counter-spies stationed so no catch roll
   * is taken first: the 1-in-10 report gate, the item-slot draw, then the
   * confidence and the two deviation draws.
   */
  const REPORT_DRAWS = [g(0), g(I_FOOD), 0, 0, 0];

  it('leaves spyowner in place and mails the master an SPYM2 row', async () => {
    const planet = makePlanet({ spyowner: 'alice' });
    planet.items[I_MEN].qty = 1_000n;
    planet.items[I_FOOD].qty = 1_000n; // fed, so no starvation notice muddies this
    const { svc, created } = buildEconomy(REPORT_DRAWS);

    const { state, revolted } = await svc.applyTick(planet);
    await settle();

    // The branch this file exists for: 'report' is NOT a removal outcome.
    expect(state.spyowner).toBe('alice');
    expect(revolted).toBe(false);

    expect(created).toHaveLength(1);
    const row = created[0];
    expect(row.userid).toBe('alice');
    expect(row.class).toBe(MAIL_CLASS_DISTRESS);
    expect(row.type).toBe(MESG_SPYM2);
    expect(row.topic).toBe('Intelligence Report');
    expect(row.name1).toBe('Bastion');
    expect(row.int1).toBe(4);
    expect(row.int2).toBe(9);
    // `debt` carries the item slot and `tax` the stated confidence: MailStat
    // has no column for either, and the inbox reads them back for type 35.
    expect(row.debt).toBe(BigInt(I_FOOD));
    expect(row.tax).toBe(50n); // 50 + rndm(48) with a zero draw
    // Reported against the POST-tick stock — check_spy runs after multiply, so
    // the colonists have already eaten. With both deviation draws at zero the
    // figure is undeviated, which is what makes it assertable at all.
    expect(row.cash).toBe(state.items[I_FOOD].qty);
  });

  it('survives a report the database refuses', async () => {
    // mailSpyIntel is fired-and-forgotten; an uncaught rejection here would
    // take down the whole economy sweep, not just one letter.
    const planet = makePlanet({ spyowner: 'alice' });
    planet.items[I_MEN].qty = 1_000n;
    planet.items[I_FOOD].qty = 1_000n;
    const { svc, create } = buildEconomy(REPORT_DRAWS, true);

    const { state } = await svc.applyTick(planet);
    await settle();

    expect(create).toHaveBeenCalled();
    expect(state.spyowner).toBe('alice');
  });
});

describe('a revolt completes even when the distress mail will not insert', () => {
  it('still hands the planet to **Free** and still cuts the garrison', async () => {
    // taxrate 60 -> pressure = 0.5 * 0.35 * 10000 = 1750 > 1000 troops.
    // First draw 0 -> floor(0 * 10) === 0, the revolt fires.
    // Second draw 0 -> divisor floor(0 * 8) + 2 = 2, so 1000 troops -> 500.
    // No spy, so check_spy returns before drawing anything.
    const planet = makePlanet({ taxrate: 60 });
    planet.items[I_MEN].qty = 10_000n;
    planet.items[I_TROOPS].qty = 1_000n;
    planet.items[I_FOOD].qty = 100_000n; // fed: starvation would move the garrison
    const { svc, create } = buildEconomy([0, 0], true);

    const { state, revolted } = await svc.applyTick(planet);
    await settle();

    expect(create).toHaveBeenCalled();       // the letter was attempted and rejected
    expect(revolted).toBe(true);
    expect(state.userid).toBe(FREE_PLANET_OWNER);
    expect(state.items[I_TROOPS].qty).toBe(500n);
  });
});
