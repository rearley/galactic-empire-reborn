/**
 * The refusal branches on PlanetStateService — the ones that stand between a
 * player and someone else's stock, tax pool or colony settings.
 *
 * Every method here writes through to Postgres the moment it agrees, so the
 * refusal IS the protection: there is no later validation to catch a bad
 * `sell`, `adm` or `wit`. The happy paths are well covered; the guards were
 * not, which is the shape of defect this suite exists to stop
 * (docs/TEST_STRATEGY.md — "would a wrong answer cost a ship, a planet, or
 * credits?").
 *
 * Canon for each guard:
 *
 * - `sell` is Zygor-3 ONLY. `cmd_sell` refuses twice — once on
 *   `!neutral(&warsptr->coord)` and again unless `plnum == 1` — before it will
 *   look at an item at all (GECMDS.C:4108-4141). `sell()` itself then requires
 *   `warsptr->items[item] >= amt` (GECMDS.C:4155). Selling stock the hold does
 *   not carry mints credits out of nothing.
 * - The admin fields are 16-bit unsigned in canon and the menu RE-PROMPTS
 *   rather than storing an over-large entry: `amt <= 32000` for both markup
 *   (`mnu_admenu2f2`, GEMAIN.C:3169) and reserve (`mnu_admenu2f4`,
 *   GEMAIN.C:3209). An unbounded reserve locks a colony's whole stock out of
 *   sale permanently.
 * - `wit` moves the amount asked for only when `amt <= plptr->tax`, and
 *   otherwise prints ADMENU2D and moves nothing (GEMAIN.C:3096-3110).
 * - `plarti` runs the economy only for `plptr->items[0].qty > 0 &&
 *   plptr->userid[0] != 0` (GEMAIN.C:2130), but the GE22e restock blocks for
 *   the two neutral-zone posts sit OUTSIDE that gate and fire on the same pass
 *   (GEMAIN.C:2147-2178). If the restock stopped firing, the hub shop runs dry
 *   between midnights and the early game has nothing to buy.
 * - `trans down` takes the cargo off the hull in the same breath it adds it to
 *   the planet (`warsptr->items[item] -= amt; plptr->items[item].qty += amt;`,
 *   GECMDS.C:3327-3330), which is why the check and the debit have to be in one
 *   critical section — see docs/audits/2026-09-09-security-review.md M2.
 * - `trans up` is the asymmetric half: `sameas(plptr->userid,warsptr->userid)
 *   || plptr->userid[0] == 0` (GECMDS.C:3374), then
 *   `plptr->items[item].qty >= amt` (GECMDS.C:3382). Getting the first wrong
 *   hands a stranger a colony's warehouse.
 *
 * These call the public service methods — the same entry points the command
 * handlers use — and assert on the resulting STATE of the planet and the hull,
 * not on what was called.
 *
 * @see GECMDS.C:4103 cmd_sell, :3306 trans_down, :3354 trans_up
 * @see GEMAIN.C:2125 plarti, :3096 mnu_admenu2b, :3169/:3209 item fields
 */
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import type { PlanetState } from '../../../src/game/planet/planet-state.types';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_MEN, I_FOOD, I_TROOPS } from '../../../src/game/constants/items';
import { NEUTRAL_RESTOCK_QTY } from '../../../src/game/planet/planet-economy';

/** The two fields of a hull these paths touch. */
interface Hold {
  userid: string;
  shipno: number;
  items: bigint[];
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 4, ysect: 2, plnum: 1,
    type: 2, xcoord: 4.5, ycoord: 2.5,
    userid: 'owner1', name: 'Aurora',
    enviorn: 1, resource: 1,
    cash: 500n, debt: 0n, tax: 1_000n, taxrate: 15,
    warnings: 0, password: 'sesame', lastattack: '',
    beacon: 'keep out', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 700n, rate: 3, sell: false, reserve: 0, markup2a: 10, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeHold(items: Partial<Record<number, bigint>> = {}): Hold {
  const cargo = new Array<bigint>(NUMITEMS).fill(0n);
  for (const [idx, qty] of Object.entries(items)) cargo[Number(idx)] = qty as bigint;
  return { userid: 'pilot1', shipno: 1, items: cargo };
}

interface Harness {
  svc: PlanetStateService;
  planet: PlanetState;
  hold: Hold;
  update: jest.Mock;
}

/**
 * The service with its map pre-loaded, as `abandon-planet.spec.ts` does. No
 * Nest module and no Prisma: `onModuleInit` is the only hydration path and it
 * would need a full Planet row shape to say anything these cases care about.
 */
function makeHarness(
  planet: PlanetState = makePlanet(),
  hold: Hold = makeHold({ [I_FOOD]: 1_000n }),
): Harness {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    planet: { update, findMany: jest.fn().mockResolvedValue([]) },
    user: { updateMany: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const ships = {
    get: (userid: string, shipno: number) =>
      userid === hold.userid && shipno === hold.shipno
        ? (hold as unknown as ShipState)
        : undefined,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      if (userid !== hold.userid || shipno !== hold.shipno) return undefined;
      fn(hold as unknown as ShipState);
      return hold as unknown as ShipState;
    },
  } as unknown as ShipStateService;

  const svc = new PlanetStateService(prisma, ships);
  (svc as unknown as { map: Map<string, PlanetState> }).map.set(
    `${planet.xsect}:${planet.ysect}:${planet.plnum}`,
    planet,
  );
  return { svc, planet, hold, update };
}

const key = (p: PlanetState): string => `${p.xsect}:${p.ysect}:${p.plnum}`;

describe('sell is Zygor-3 only, and never sells stock the hold lacks', () => {
  it('refuses at a planet outside the neutral zone and leaves the cargo aboard', async () => {
    // `if (!neutral(&warsptr->coord)) { SELL1; return; }` — GECMDS.C:4115.
    const { svc, planet, hold } = makeHarness();

    const res = await svc.sell(key(planet), 'pilot1', 1, I_FOOD, 500);

    expect(res).toEqual({ ok: false, reason: 'NOT_NEUTRAL_ZONE' });
    expect(hold.items[I_FOOD]).toBe(1_000n);
  });

  it('refuses at the neutral zone\'s OTHER post — the market is plnum 1', async () => {
    // `if (neutral(...) && plnum == 1) /*must be Zygor-3*/` — GECMDS.C:4128.
    // Tahanian Station (plnum 2) buys nothing.
    const post = makePlanet({ xsect: 0, ysect: 0, plnum: 2, userid: null });
    const { svc, hold } = makeHarness(post);

    const res = await svc.sell(key(post), 'pilot1', 1, I_FOOD, 500);

    expect(res).toEqual({ ok: false, reason: 'NOT_PLNUM_1' });
    expect(hold.items[I_FOOD]).toBe(1_000n);
  });

  it('refuses to sell more than the hull carries', async () => {
    // `if (warsptr->items[item] >= amt)` — GECMDS.C:4155. Without this the
    // market pays for cargo that never existed and the hold goes negative.
    const zygor = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: null });
    const { svc, hold } = makeHarness(zygor, makeHold({ [I_FOOD]: 100n }));

    const res = await svc.sell(key(zygor), 'pilot1', 1, I_FOOD, 101);

    expect(res).toEqual({ ok: false, reason: 'INSUFFICIENT_CARGO' });
    expect(hold.items[I_FOOD]).toBe(100n);
  });

  it('refuses when the seller has no hull in play at all', async () => {
    // The hold is read INSIDE the lock; a ship that is gone reads as zero
    // cargo rather than as an unchecked sale.
    const zygor = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: null });
    const { svc } = makeHarness(zygor, { userid: 'someone_else', shipno: 9, items: [] });

    const res = await svc.sell(key(zygor), 'pilot1', 1, I_FOOD, 10);

    expect(res).toEqual({ ok: false, reason: 'INSUFFICIENT_CARGO' });
  });

  it('takes the goods off the hull when it does sell', async () => {
    // Food baseprice is 2 (constants/items.ts BASEPRICE, MBMGEMSG.MSG). 1,000
    // units: doll = 2,000; fee = 1 + 2,000/1,000 = 3; proceeds = 1,997.
    // @see GECMDS.C:4153-4160
    const zygor = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: null });
    const { svc, hold } = makeHarness(zygor, makeHold({ [I_FOOD]: 1_000n }));

    const res = await svc.sell(key(zygor), 'pilot1', 1, I_FOOD, 1_000);

    expect(res).toEqual({ ok: true, transferred: 1_000, proceeds: 1_997n, fee: 3n });
    expect(hold.items[I_FOOD]).toBe(0n);
  });
});

describe('adm refuses what canon re-prompts on', () => {
  it('will not let a non-owner touch the colony', async () => {
    const { svc, planet, update } = makeHarness();

    const res = await svc.applyAdminChange(key(planet), 'raider', {
      type: 'taxrate', value: 90,
    });

    expect(res).toEqual({ ok: false, reason: 'NOT_OWNER' });
    expect(planet.taxrate).toBe(15);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a rate for an item slot that does not exist', async () => {
    // Canon's menu only ever offers the 14 real slots; a bad index here would
    // write past the item array and lose the whole production schedule.
    const { svc, planet } = makeHarness();
    const before = planet.items.map((it) => it.rate);

    const res = await svc.applyAdminChange(key(planet), 'owner1', {
      type: 'rate', itemIndex: NUMITEMS, value: 10,
    });

    expect(res).toEqual({ ok: false, reason: 'INVALID' });
    expect(planet.items.map((it) => it.rate)).toEqual(before);
  });

  it('refuses a reserve above canon\'s 32,000 ceiling', async () => {
    // `amt <= 32000` — GEMAIN.C:3209. A reserve larger than any stock a planet
    // can hold takes the item off sale for good.
    const { svc, planet } = makeHarness();

    const res = await svc.applyAdminChange(key(planet), 'owner1', {
      type: 'reserve', itemIndex: I_FOOD, value: 32_001,
    });

    expect(res).toEqual({ ok: false, reason: 'INVALID' });
    expect(planet.items[I_FOOD].reserve).toBe(0);

    const ok = await svc.applyAdminChange(key(planet), 'owner1', {
      type: 'reserve', itemIndex: I_FOOD, value: 32_000,
    });
    expect(ok).toEqual({ ok: true, rateClamp: undefined });
    expect(planet.items[I_FOOD].reserve).toBe(32_000);
  });

  it('refuses a markup above the same ceiling', async () => {
    // `amt <= 32000` — GEMAIN.C:3169, the non-owner price field.
    const { svc, planet } = makeHarness();

    const res = await svc.applyAdminChange(key(planet), 'owner1', {
      type: 'markup', itemIndex: I_FOOD, value: 40_000,
    });

    expect(res).toEqual({ ok: false, reason: 'INVALID' });
    expect(planet.items[I_FOOD].markup2a).toBe(10);
  });

  it('refuses a blank name and keeps the old one', async () => {
    // Canon re-prompts rather than storing an empty name (GEMAIN.C:2955-2959);
    // a nameless planet cannot be addressed by `pla` or `loc`.
    const { svc, planet } = makeHarness();

    const res = await svc.applyAdminChange(key(planet), 'owner1', {
      type: 'name', value: '',
    });

    expect(res).toEqual({ ok: false, reason: 'INVALID' });
    expect(planet.name).toBe('Aurora');
  });
});

describe('wit moves only what the tax pool actually holds', () => {
  it('refuses a non-owner and leaves the pool whole', async () => {
    const { svc, planet } = makeHarness();

    const res = await svc.withdrawTax(key(planet), 'raider');

    expect(res).toEqual({ ok: false, reason: 'NOT_OWNER' });
    expect(planet.tax).toBe(1_000n);
  });

  it('refuses an amount larger than the pool', async () => {
    // `if (amt <= plptr->tax)` else ADMENU2D — GEMAIN.C:3096. Characterization
    // note: the port reports this refusal as NOT_FOUND, which is not a canon
    // distinction (canon has one refusal message); the STATE is what matters —
    // nothing moves.
    const { svc, planet } = makeHarness();

    const res = await svc.withdrawTax(key(planet), 'owner1', 1_001n);

    expect(res).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(planet.tax).toBe(1_000n);
  });

  it('takes a partial amount and leaves the remainder on the planet', async () => {
    // `waruptr->cash += amt; plptr->tax -= amt;` — GEMAIN.C:3101-3102.
    const { svc, planet } = makeHarness();

    const res = await svc.withdrawTax(key(planet), 'owner1', 400n);

    expect(res).toEqual({ ok: true, amount: 400n });
    expect(planet.tax).toBe(600n);
  });

  it('takes the whole pool when no amount is given', async () => {
    const { svc, planet } = makeHarness();

    const res = await svc.withdrawTax(key(planet), 'owner1');

    expect(res).toEqual({ ok: true, amount: 1_000n });
    expect(planet.tax).toBe(0n);
  });
});

describe('the economy tick skips unowned worlds but always restocks the hub', () => {
  it('does not run production on an unowned planet', async () => {
    // `plptr->userid[0] != 0` — GEMAIN.C:2130. An unowned world produces
    // nothing; if it did, a colony could be farmed without ever being claimed
    // or defended.
    const wild = makePlanet({ userid: null });
    wild.items[I_MEN].qty = 5_000n;
    wild.items[I_FOOD].qty = 5_000n;
    const { svc, update } = makeHarness(wild);

    await svc.runEconomicTickFor(key(wild));

    expect(wild.items[I_MEN].qty).toBe(5_000n);
    expect(wild.items[I_FOOD].qty).toBe(5_000n);
    expect(update).not.toHaveBeenCalled();
  });

  it('puts Zygor-3 back to 1,032,000 of everything on the same pass', async () => {
    // The GE22e block sits outside the ownership gate and undoes the MAXPL
    // storage clamp `multiply()` has just applied (GEMAIN.C:2147-2160). Losing
    // it leaves the hub selling MAXPL quantities until the next midnight.
    const zygor = makePlanet({ xsect: 0, ysect: 0, plnum: 1, userid: 'sysop' });
    for (const item of zygor.items) {
      item.qty = 5n;
      item.sell = false;
    }
    zygor.items[I_MEN].qty = 5_000n;
    const { svc, update } = makeHarness(zygor);

    await svc.runEconomicTickFor(key(zygor));

    expect(zygor.items[I_FOOD].qty).toBe(NEUTRAL_RESTOCK_QTY);
    expect(zygor.items[I_TROOPS].qty).toBe(NEUTRAL_RESTOCK_QTY);
    expect(zygor.items.every((it) => it.sell)).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('tra down debits the hull inside the same critical section', () => {
  it('refuses when the hull is short and adds nothing to the planet', async () => {
    // `if (warsptr->items[item] >= amt)` — GECMDS.C:3327. The check and the
    // debit used to be in different places, so concurrent transfers all passed
    // one stale snapshot and the planet gained stock the hold never had.
    const { svc, planet, hold } = makeHarness(makePlanet(), makeHold({ [I_FOOD]: 10n }));

    const res = await svc.depositToPlanet(key(planet), 'pilot1', 1, I_FOOD, 11n);

    expect(res).toEqual({ ok: false, reason: 'INSUFFICIENT_CARGO' });
    expect(hold.items[I_FOOD]).toBe(10n);
    expect(planet.items[I_FOOD].qty).toBe(700n);
  });

  it('moves exactly the amount asked for, emptying a hold that carried it all', async () => {
    const { svc, planet, hold } = makeHarness(makePlanet(), makeHold({ [I_FOOD]: 250n }));

    const res = await svc.depositToPlanet(key(planet), 'pilot1', 1, I_FOOD, 250n);

    expect(res).toEqual({ ok: true });
    expect(hold.items[I_FOOD]).toBe(0n);
    expect(planet.items[I_FOOD].qty).toBe(950n);
  });

  it('lets a non-owner deposit — TRANSOPT is YES, and that is deliberate', async () => {
    // `trans_opt || sameas(plptr->userid,warsptr->userid)` — GECMDS.C:3323,
    // with TRANSOPT shipped YES (MBMGEMSG.MSG:191). This is what lets a captain
    // resupply a team-mate's colony.
    const { svc, planet, hold } = makeHarness(
      makePlanet({ userid: 'someone_else' }),
      makeHold({ [I_FOOD]: 40n }),
    );

    const res = await svc.depositToPlanet(key(planet), 'pilot1', 1, I_FOOD, 40n);

    expect(res).toEqual({ ok: true });
    expect(planet.items[I_FOOD].qty).toBe(740n);
    expect(hold.items[I_FOOD]).toBe(0n);
  });
});

describe('tra up is the half that checks ownership', () => {
  it("refuses a stranger at someone else's colony", async () => {
    // `sameas(plptr->userid,warsptr->userid) || plptr->userid[0] == 0` —
    // GECMDS.C:3374. Without it any hull in orbit empties the warehouse.
    const { svc, planet } = makeHarness(makePlanet({ userid: 'someone_else' }));

    const res = await svc.withdrawFromPlanet(key(planet), 'pilot1', I_FOOD, 100n);

    expect(res).toEqual({ ok: false, reason: 'NOT_OWNER' });
    expect(planet.items[I_FOOD].qty).toBe(700n);
  });

  it('allows an unclaimed planet to be looted before it is claimed', async () => {
    // The `plptr->userid[0] == 0` half of the same condition.
    const wild = makePlanet({ userid: null });
    const { svc } = makeHarness(wild);

    const res = await svc.withdrawFromPlanet(key(wild), 'pilot1', I_FOOD, 100n);

    expect(res).toEqual({ ok: true });
    expect(wild.items[I_FOOD].qty).toBe(600n);
  });

  it('refuses to take more than the surface holds', async () => {
    // `if (plptr->items[item].qty >= amt)` — GECMDS.C:3382. An unchecked
    // withdrawal drives the stock negative and mints goods.
    const { svc, planet, update } = makeHarness();

    const res = await svc.withdrawFromPlanet(key(planet), 'owner1', I_FOOD, 701n);

    expect(res).toEqual({ ok: false, reason: 'INSUFFICIENT' });
    expect(planet.items[I_FOOD].qty).toBe(700n);
    expect(update).not.toHaveBeenCalled();
  });
});
