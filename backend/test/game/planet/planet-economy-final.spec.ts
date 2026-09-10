/**
 * The last three decisions in `PlanetEconomyService` that nothing entered, and
 * the production formula itself, pinned exactly before anyone restructures the
 * loop it lives in.
 *
 * PART ONE — the arithmetic of `multiply`.
 *
 *   men = (float)plptr->items[I_MEN].qty;
 *   qty = (men * (rate/100.0)*(hrs/6.0))/7.0;
 *   fact *= ((float)(plptr->enviorn+plptr->resource+2) * .25);
 *   fact *= taxfact;
 *   temp = plptr->items[i].qty;  temp += (long)(qty * fact);
 *
 *   @see GEPLANET.C:268-291 the production loop
 *   @see GEPLANET.C:335-338 the tax levy on the GROWN population
 *
 * Every other spec on this formula asserts a direction — cash fell, food was
 * eaten, tax is proportional. None states the number. That is exactly the gap
 * an optimisation slips through: hoisting `envFact * taxfact` out of the loop,
 * or flooring the increment instead of the total, changes the stock by one unit
 * a tick and no existing assertion notices. A colony that produces one unit a
 * tick less compounds into a materially poorer planet over a week of real time,
 * and it would be discovered by a player, not by the suite.
 *
 * The case below is chosen so nothing else moves: cash is zero so the `cash >
 * 0` production bonus never applies and the `tfact` decay has nothing to decay,
 * the colony is fed so nobody starves, and no slot is near its ceiling. What is
 * left is the formula, alone, on two producing slots — including the one that
 * matters most, I_MEN at slot 0, whose grown figure slots 1-13 and the tax
 * levy then read back.
 *
 * PART TWO — a spy caught on a planet nobody owns.
 *
 *   prfmsg(SPYC1,...); strcpy(mail.userid,plptr->spyowner); sendit();
 *   prfmsg(SPYC2,...); strcpy(mail.userid,plptr->userid);  sendit();
 *
 *   @see GEPLANET.C:126-138
 *
 * Canon copies `plptr->userid` into the second letter unconditionally — on an
 * unclaimed world that is an empty string, and the protest goes nowhere. The
 * port states it as a guard, `if (planet.userid)`, and that guard has only ever
 * been taken one way. Drop it and an unowned planet queues a MailStat row with
 * a null recipient on a column that has a foreign key to User: the insert
 * throws inside a fire-and-forget path, four times an hour, per infiltrated
 * rock. The spy is still caught and the spy's own master is still told, which
 * is the half that must survive.
 *
 * PART THREE — two notices in one millisecond.
 *
 * `msgno` is part of the (userid, class, msgno) key. A tick that starves both
 * the garrison and the civilians writes two rows for one recipient in the same
 * class, and `Date.now()` alone returns the same value for both. `nextMsgno`
 * exists for that collision and its second arm — `this.lastMsgno + 1n` — is
 * reachable only when the clock has not advanced. Freezing `Date.now` makes
 * that the certain case rather than the likely one, so a refactor back to a
 * bare timestamp fails here instead of intermittently in production.
 *
 * @see GEPLANET.C:206-219 MESG06, the troop notice
 * @see GEPLANET.C:234-251 MESG07, the civilian notice
 */
import { PlanetEconomyService } from '../../../src/game/planet/planet-economy.service';
import type { PlanetState } from '../../../src/game/planet/planet-state.types';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import type { Random } from '../../../src/game/combat/random.port';
import { MAIL_CLASS_DISTRESS } from '../../../src/game/constants';
import { I_FOOD, I_MEN, I_SPY, I_TROOPS, NUMITEMS } from '../../../src/game/constants/items';

interface MailRow {
  userid: string;
  class: number;
  msgno: bigint;
  type: number;
  stamp: number;
  topic: string;
  name1: string;
  int1: number;
  int2: number;
  cash: bigint;
}

function makePlanet(over: Partial<PlanetState> = {}): PlanetState {
  const items = Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
  return {
    xsect: 4, ysect: 9, plnum: 1, type: 2, xcoord: 4.5, ycoord: 9.5,
    userid: 'owner1', name: 'Bastion', enviorn: 3, resource: 3,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0, password: '',
    lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items, ...over,
  };
}

function buildEconomy(draws: number[] = []) {
  const created: MailRow[] = [];
  const create = jest.fn(async (arg: { data: MailRow }) => {
    created.push(arg.data);
    return {};
  });
  const prisma = { mailStat: { create } } as unknown as PrismaService;
  let i = 0;
  const random = { next: () => draws[i++] ?? 0 } as unknown as Random;
  return { svc: new PlanetEconomyService(random, prisma), created, create };
}

/** Let the fire-and-forget inserts settle before asserting on them. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Part one — the production formula, to the unit
// ---------------------------------------------------------------------------

describe('one tick of multiply, stated exactly (GEPLANET.C:268-291)', () => {
  /**
   * enviorn 3 + resource 3 -> envFact (3+3+2)*0.25 = 2.0
   * taxrate 12            -> taxfact 1 - 12/120  = 0.9
   * so `fact` is 1.8 on every slot, and tfact is 0.95 with nothing to decay.
   *
   * Slot 0 (men), rate 55, MANHOURS 3500:
   *   qty   = 10000 * 0.55 * (3500/10000/6) / 7 = 45.8333...
   *   grown = 10000 + 45.8333... * 1.8         = 10082.5  -> 10082
   *
   * Slot 5 (food), rate 40, MANHOURS 8000, and the population has ALREADY
   * grown when this slot is reached — `men` is re-read at the top of every
   * iteration, which is why 10082 and not 10000 appears here:
   *   eaten = floor(1000/100) + floor(10000/100) = 110, so 5000 -> 4890
   *   qty   = 10082 * 0.40 * (8000/10000/6) / 7 = 76.8152...
   *   grown = 4890 + 76.8152... * 1.8           = 5028.267... -> 5028
   *
   * Tax is levied on the grown men, not the starting figure:
   *   floor(12/1200 * 10082) = floor(100.82) = 100
   */
  it('produces 82 colonists and 138 cases of food, and levies 100 in tax', async () => {
    const planet = makePlanet({ taxrate: 12 });
    planet.items[I_MEN].qty = 10_000n;
    planet.items[I_MEN].rate = 55;
    planet.items[I_FOOD].qty = 5_000n;
    planet.items[I_FOOD].rate = 40;
    planet.items[I_TROOPS].qty = 1_000n;
    const { svc, create } = buildEconomy();

    const { state, revolted } = await svc.applyTick(planet);
    await settle();

    expect(state.items[I_MEN].qty).toBe(10_082n);
    expect(state.items[I_FOOD].qty).toBe(5_028n);
    // A rate-0 slot produces nothing and is not otherwise touched.
    expect(state.items[I_TROOPS].qty).toBe(1_000n);
    expect(state.cash).toBe(0n);
    expect(state.tax).toBe(100n);

    // Nothing starved, nothing topped out, and pressure (0.1 * 0.35 * 10082 =
    // 352.87) sits under the 1,000-strong garrison, so no letter is written
    // and the revolt gate is never even rolled.
    expect(revolted).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Part two — the second protest has no addressee
// ---------------------------------------------------------------------------

describe('a spy caught on an unowned planet (GEPLANET.C:126-138)', () => {
  it('protests to the spy master only, and still kills the spy', async () => {
    // 5 counter-spies -> odds = floor(50/5)+1 = 11, and a draw of 0 makes
    // floor(0 * 11) === 0, the catch. The spy stock is a rate-0 slot below its
    // ceiling (floor(MAXPL[I_SPY] * 1.8) = 9), so the tick leaves it at 5 and
    // the odds are the ones this comment computes.
    const planet = makePlanet({ userid: null, spyowner: 'mallory' });
    planet.items[I_MEN].qty = 1_000n;
    planet.items[I_FOOD].qty = 1_000n;
    planet.items[I_SPY].qty = 5n;
    const { svc, created } = buildEconomy([0]);

    const { state, revolted } = await svc.applyTick(planet);
    await settle();

    expect(state.spyowner).toBe('');
    expect(state.userid).toBeNull();
    expect(revolted).toBe(false);

    // SPYC1 and nothing else. Two rows here would mean the SPYC2 guard is gone.
    expect(created).toHaveLength(1);
    expect(created[0].userid).toBe('mallory');
    expect(created[0].type).toBe(31); // SPYC1
    expect(created[0].topic).toBe('OFFICIAL PROTEST');
    expect(created[0].class).toBe(MAIL_CLASS_DISTRESS);
    expect(created[0].name1).toBe('Bastion');
    expect(created[0].int1).toBe(4);
    expect(created[0].int2).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Part three — two starvation notices, one millisecond
// ---------------------------------------------------------------------------

describe('two notices in one tick take distinct msgnos', () => {
  const FROZEN = 1_700_000_000_000;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives the second letter lastMsgno + 1 when the clock has not moved', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(FROZEN);

    // 1,000 troops against 5 food: floor(1000/100) = 10 > 5, so 125 starve and
    // 875 remain. The survivors then eat the store to nothing, and the 10,000
    // civilians starve in turn: 1,250 lost, 8,750 remain. Two letters, one
    // recipient, one class, one millisecond.
    const planet = makePlanet();
    planet.items[I_MEN].qty = 10_000n;
    planet.items[I_TROOPS].qty = 1_000n;
    planet.items[I_FOOD].qty = 5n;
    const { svc, created } = buildEconomy();

    const { state } = await svc.applyTick(planet);
    await settle();

    expect(state.items[I_TROOPS].qty).toBe(875n);
    expect(state.items[I_MEN].qty).toBe(8_750n);
    expect(state.items[I_FOOD].qty).toBe(0n);

    expect(created).toHaveLength(2);
    // Troops first, as canon writes them (MESG06 at :212, MESG07 at :248).
    expect(created[0].type).toBe(6);
    expect(created[0].topic).toBe('TROOPS STARVED');
    expect(created[0].cash).toBe(125n);
    expect(created[1].type).toBe(7);
    expect(created[1].topic).toBe('COLONISTS STARVED');
    expect(created[1].cash).toBe(1_250n);

    // The key that a bare `Date.now()` would collide on.
    expect(created[0].msgno).toBe(BigInt(FROZEN));
    expect(created[1].msgno).toBe(BigInt(FROZEN) + 1n);
    expect(created[0].stamp).toBe(Math.floor(FROZEN / 1000));
    expect(created[1].stamp).toBe(Math.floor(FROZEN / 1000));
  });
});
