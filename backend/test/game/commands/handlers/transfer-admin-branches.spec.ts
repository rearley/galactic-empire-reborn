/**
 * Cargo and colony administration — the refusal and arithmetic branches of
 * `tra` and `adm` that round one left uncovered.
 *
 * Both commands write straight through to the planet map and the hull, so the
 * refusal IS the protection: nothing downstream re-checks a bad quantity, a
 * bad item keyword or a bad production rate. Everything here enters through
 * the REAL command entry point — `service.command.handler(ship, args, ctx)`,
 * the same call `CommandRouterService` makes — over a REAL
 * `PlanetStateService` with its map pre-loaded, and asserts the resulting
 * STATE of the planet and the hold, never a mock call count. Three defects in
 * this codebase survived unit tests that fed a helper values no caller passes
 * (docs/TEST_STRATEGY.md, "Test the caller's arithmetic").
 *
 * Canon for each branch:
 *
 * - `cmd_transfer` reaches `trans_down`/`trans_up` only when the ship is in
 *   orbit; `where < 10` means space, and canon answers TRANSFR3 "We are not in
 *   orbit" (GECMDS.C:3300, :3354).
 * - The quantity and the item keyword are both parsed before anything moves —
 *   `genearas(kwrd[i], margv[n])` against the three-letter table
 *   (GECMDS.C:3287). A quantity that fails to parse must not fall through as
 *   zero or NaN.
 * - `trans_up` must fit the hold. Weight is per-item (ITMWT01-14,
 *   MBMGEMSG.MSG) and GOLD IS HALF A TON — `ITMWT13 {Weight of 100 Gold: 50}`.
 *   The port carried 2 for years, from the stale `GE/MSG/` snapshot, which is
 *   a real bug this file pins: at 0.5, an empty 1,000-ton hull takes exactly
 *   2,000 gold and refuses 2,001.
 * - `plptr->items[item].qty >= amt` else TRANSUP3 — a planet cannot ship stock
 *   it does not hold (GECMDS.C:3382).
 * - The two directions are asymmetric: DOWN is open to anyone because
 *   `trans_opt` ships YES (TRANSOPT, MBMGEMSG.MSG:191, GECMDS.C:3323), UP
 *   requires `sameas(plptr->userid,warsptr->userid) || plptr->userid[0] == 0`
 *   (GECMDS.C:3374).
 * - Ship-to-ship is a port addition (deviation D1). A BARE NUMBER addresses
 *   your OWN fleet only, because `shipno` is a per-user index — every
 *   captain's first hull is shipno 1.
 * - `adm rate` spends from ONE 100-point budget shared by every item:
 *   `for (i=0;i<NUMITEMS;++i) if (i != titem) pcnt += rate; if (rate+pcnt >
 *   100) rate = 100-pcnt;` then ADMEN2FA/ADMEN2FB report the cut and the
 *   remainder (GEMAIN.C:3539-3565).
 * - `adm rate/markup/reserve/sellflag` all take `<item>` BEFORE the value.
 *   Getting the order wrong must refuse, not write the wrong field.
 * - `adm password` branches three ways on the WORD (GEMAIN.C:3266-3290):
 *   "none" clears the team lock, "team" sets it from the owner's teamcode and
 *   CLEARS BOTH when the owner has no team, anything else is a plain password.
 *
 * Deliberately NOT covered here, and why:
 * - `tra down` / `tra up` at a sector with no planet in the map
 *   (transfer.handler.ts:72, :135). `where >= 10` is only ever set by `orb`,
 *   which resolves the planet first, so the state is unreachable from play.
 * - `ITEM_NAMES[itemIndex] ?? itemArg` (:221) — a display fallback on an index
 *   the resolver has already bounded.
 * - `adm claim` refusals (admin.handler.ts:290-297): covered end to end by
 *   test/unit/adm-claim.spec.ts, including the neutral-zone and planet-cap
 *   arms.
 * - `tra up`/`tra down` ownership refusals: covered by
 *   test/game/commands/handlers/transfer-ownership-canon.spec.ts.
 *
 * @see GECMDS.C:3300 trans_down, :3354 trans_up
 * @see GEMAIN.C:2895-2990 mnu_admenu, :3539-3565 update_items
 */
import { TransferHandlerService } from '../../../../src/game/commands/handlers/transfer.handler';
import { AdminHandlerService } from '../../../../src/game/commands/handlers/admin.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import type { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { planetKey } from '../../../../src/game/planet/planet-state.types';
import type { PrismaService } from '../../../../src/prisma/prisma.service';
import type { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import type { ShipState } from '../../../../src/game/ship/ship-state.types';
import type { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';
import {
  NUMITEMS, I_FOOD, I_GOLD, I_ION, I_MEN, I_TORP,
} from '../../../../src/game/constants/items';

const ctx: CommandContext = {};

/** The sector and planet every case in this file uses. */
const XSECT = 20;
const YSECT = 20;
const PLNUM = 1;
const KEY = planetKey(XSECT, YSECT, PLNUM);

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'trader',
    shipname: 'Trader',
    xcoord: XSECT + 0.5,
    ycoord: YSECT + 0.5,
    energy: 50_000,
    phasrtype: 1,
    where: 10 + PLNUM,
    items: new Array<bigint>(NUMITEMS).fill(0n),
    topspeed: 10,
    maxTons: 1_000,
    ...over,
  });
}

function makePlanet(over: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: XSECT, ysect: YSECT, plnum: PLNUM,
    type: 2, xcoord: XSECT + 0.5, ycoord: YSECT + 0.5,
    userid: 'trader', name: 'Aurora',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 10,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 1_000n, rate: 0, sell: false, reserve: 0, markup2a: 10, sold2a: 0n,
    })),
    ...over,
  } as PlanetState;
}

interface Harness {
  transfer: TransferHandlerService;
  admin: AdminHandlerService;
  planet: PlanetState;
  ship: ShipState;
  ships: ShipState[];
}

/**
 * A real PlanetStateService with its map pre-loaded, plus a ship registry the
 * planet service and the transfer handler both read and mutate. No Nest
 * module and no Prisma — `prisma.planet.update` is the only DB call on these
 * paths and it says nothing the cases assert on.
 */
function makeHarness(planet: PlanetState, ships: ShipState[]): Harness {
  const prisma = {
    planet: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    user: { updateMany: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const find = (userid: string, shipno: number): ShipState | undefined =>
    ships.find((s) => s.userid === userid && s.shipno === shipno);

  const shipState = {
    get: find,
    findAllShips: () => ships,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = find(userid, shipno);
      if (!s) return undefined;
      fn(s);
      return s;
    },
  } as unknown as ShipStateService;

  const planetService = new PlanetStateService(prisma, shipState);
  (planetService as unknown as { map: Map<string, PlanetState> }).map.set(KEY, planet);

  return {
    transfer: new TransferHandlerService(shipState, planetService),
    admin: new AdminHandlerService(planetService),
    planet,
    ship: ships[0],
    ships,
  };
}

/** The real dispatch: what CommandRouterService calls with the parsed args. */
async function tra(h: Harness, ...args: string[]): Promise<CommandResult> {
  return await Promise.resolve(h.transfer.command.handler(h.ship, args, ctx));
}

async function adm(h: Harness, ...args: string[]): Promise<CommandResult> {
  return await Promise.resolve(h.admin.command.handler(h.ship, args, ctx));
}

const textOf = (res: CommandResult): string => res.lines.map((l) => l.text).join('\n');

describe('tra down/up refuse before anything moves', () => {
  it('refuses both directions in open space, and neither side changes', async () => {
    // `where < 10` is space. Canon reaches trans_down/trans_up only from the
    // orbit branch and answers TRANSFR3 otherwise (GECMDS.C:3300, :3354).
    // Without the gate a captain flying past a sector empties the warehouse
    // under it.
    const ship = makeShip({ where: 0, items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_FOOD] = 100n; return i;
    })() });
    const h = makeHarness(makePlanet(), [ship]);

    const down = await tra(h, 'down', '10', 'foo');
    const up = await tra(h, 'up', '10', 'foo');

    expect(textOf(down)).toBe(formatMessage(MessageId.TRAN_NOT_ORBIT));
    expect(textOf(up)).toBe(formatMessage(MessageId.TRAN_NOT_ORBIT));
    expect(h.planet.items[I_FOOD].qty).toBe(1_000n);
    expect(ship.items[I_FOOD]).toBe(100n);
  });

  it('refuses a zero, negative or unparsable quantity on the up leg', async () => {
    // parseInt('') is NaN and parseInt('-5') is negative; either falling
    // through would run the capacity maths on a non-number and hand the hold
    // whatever BigInt(NaN) does — a thrown command, or a negative credit to
    // the planet.
    const h = makeHarness(makePlanet(), [makeShip()]);

    for (const bad of ['0', '-5', 'lots', '']) {
      const res = await tra(h, 'up', bad, 'foo');
      expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_FMT));
    }
    expect(h.planet.items[I_FOOD].qty).toBe(1_000n);
    expect(h.ship.items[I_FOOD]).toBe(0n);
  });

  it('refuses an item keyword that names nothing, on both legs', async () => {
    // `genearas(kwrd[i], margv[n])` — no match means no transfer
    // (GECMDS.C:3287). A -1 index falling through indexes items[-1] and, on
    // the down leg, would credit the planet nothing while debiting the hull.
    const ship = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_FOOD] = 100n; return i;
    })() });
    const h = makeHarness(makePlanet(), [ship]);

    expect(textOf(await tra(h, 'up', '5', 'widgets'))).toBe(formatMessage(MessageId.TRAN_FMT));
    expect(textOf(await tra(h, 'down', '5', 'widgets'))).toBe(formatMessage(MessageId.TRAN_FMT));
    expect(ship.items[I_FOOD]).toBe(100n);
    expect(h.planet.items[I_FOOD].qty).toBe(1_000n);
  });

  it('refuses to send down cargo the hold does not carry', async () => {
    // `if (warsptr->items[item] >= amt)` else TRANSFR1 — GECMDS.C:3327. The
    // fast path in the handler and the authoritative check inside the planet
    // lock must agree; if the handler's is inverted the planet gains stock the
    // hull never had.
    const ship = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_TORP] = 3n; return i;
    })() });
    const h = makeHarness(makePlanet(), [ship]);

    const res = await tra(h, 'down', '4', 'tor');

    expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_NO_CARGO));
    expect(ship.items[I_TORP]).toBe(3n);
    expect(h.planet.items[I_TORP].qty).toBe(1_000n);
  });

  it('refuses to lift more than the colony holds, and the stock stays put', async () => {
    // `plptr->items[item].qty >= amt` else TRANSUP3 — GECMDS.C:3382. Without
    // it the planet goes negative and the hull is credited from nothing.
    const planet = makePlanet();
    planet.items[I_MEN].qty = 40n;
    const h = makeHarness(planet, [makeShip({ maxTons: 100_000 })]);

    const res = await tra(h, 'up', '41', 'men');

    expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_PLANET_LOW));
    expect(planet.items[I_MEN].qty).toBe(40n);
    expect(h.ship.items[I_MEN]).toBe(0n);
  });
});

describe('tra up weighs the load against the hold', () => {
  it('refuses a load that will not fit, counting what is already aboard', async () => {
    // Ion cannons are 250 tons each (ITMWT04). A 1,000-ton hull carrying three
    // has 250 tons free; a fourth fits, a fifth does not — and the refusal is
    // BUY8, the "no room" message, not a transfer that silently overloads the
    // hull. An overloaded hull is a real balance break: tonnage is what stops
    // an Interceptor hauling a freighter's cargo.
    const ship = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_ION] = 3n; return i;
    })() });
    const h = makeHarness(makePlanet(), [ship]);

    const tooMuch = await tra(h, 'up', '2', 'ion');
    expect(textOf(tooMuch)).toBe(formatMessage(MessageId.BUY8));
    expect(ship.items[I_ION]).toBe(3n);
    expect(h.planet.items[I_ION].qty).toBe(1_000n);

    const fits = await tra(h, 'up', '1', 'ion');
    expect(ship.items[I_ION]).toBe(4n);
    expect(h.planet.items[I_ION].qty).toBe(999n);
    expect(textOf(fits)).toBe(formatMessage(MessageId.TRAN_UP_OK, 1, 'ion cannons'));
  });

  it('weighs gold at canon half a ton, so 1,000 tons is exactly 2,000 gold', async () => {
    // ITMWT13 {Weight of 100 Gold: 50} — half a ton each. The port carried 2,
    // taken from the stale GE/MSG snapshot, which cut a hull's gold capacity
    // to a quarter of canon's. Directly worth credits: gold is how a colony's
    // takings get home.
    const planet = makePlanet();
    planet.items[I_GOLD].qty = 10_000n;
    const h = makeHarness(planet, [makeShip({ maxTons: 1_000 })]);

    const overweight = await tra(h, 'up', '2001', 'gol');
    expect(textOf(overweight)).toBe(formatMessage(MessageId.BUY8));
    expect(h.ship.items[I_GOLD]).toBe(0n);

    await tra(h, 'up', '2000', 'gol');
    expect(h.ship.items[I_GOLD]).toBe(2_000n);
    expect(planet.items[I_GOLD].qty).toBe(8_000n);
  });
});

describe('tra down onto a colony that is not yours', () => {
  it('lands the cargo anyway — TRANSOPT ships YES — and the hull pays for it', async () => {
    // `if (trans_opt || sameas(plptr->userid,warsptr->userid))` —
    // GECMDS.C:3323, with TRANSOPT {…: YES} at MBMGEMSG.MSG:191. This is what
    // lets a captain resupply a team-mate's world. Both sides are asserted
    // because the debit and the credit happen inside one critical section.
    const ship = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_FOOD] = 60n; return i;
    })() });
    const h = makeHarness(makePlanet({ userid: 'someone_else' }), [ship]);

    const res = await tra(h, 'down', '40', 'foo');

    expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_DOWN_OK, 40, 'food cases'));
    expect(ship.items[I_FOOD]).toBe(20n);
    expect(h.planet.items[I_FOOD].qty).toBe(1_040n);
  });
});

describe('ship-to-ship: a bare number is your own fleet, never a stranger', () => {
  it('credits YOUR second hull, not the rival hull sharing that shipno', async () => {
    // `shipno` is a per-user index, so every captain has a ship 2. The first
    // implementation matched `allShips.find(s => s.shipno === n)` and handed
    // the cargo to whichever ship sat first in the map — here, the rival. The
    // rival is deliberately FIRST in the registry so a regression finds it.
    const mine = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_FOOD] = 50n; return i;
    })() });
    const rival = makeShip({
      userid: 'rival', shipno: 2, shipname: 'Vulture', maxTons: 100_000,
    });
    const mySecond = makeShip({
      userid: 'trader', shipno: 2, shipname: 'Trader II', maxTons: 100_000,
    });
    const h = makeHarness(makePlanet(), [mine, rival, mySecond]);
    h.ships.splice(0, h.ships.length, rival, mine, mySecond);

    const res = await tra(h, '30', 'foo', '2');

    expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_OK, 30, 'food cases', 'Trader II'));
    expect(mySecond.items[I_FOOD]).toBe(30n);
    expect(rival.items[I_FOOD]).toBe(0n);
    expect(mine.items[I_FOOD]).toBe(20n);
  });

  it('refuses a command with no target at all and moves nothing', async () => {
    // `tra 30 foo` is two arguments; the ship-to-ship form needs three. A
    // fall-through here resolves an empty target string.
    const mine = makeShip({ items: (() => {
      const i = new Array<bigint>(NUMITEMS).fill(0n); i[I_FOOD] = 50n; return i;
    })() });
    const h = makeHarness(makePlanet(), [mine]);

    const res = await tra(h, '30', 'foo');

    expect(textOf(res)).toBe(formatMessage(MessageId.TRAN_FMT));
    expect(mine.items[I_FOOD]).toBe(50n);
  });
});

describe('adm rate spends from one shared 100-point budget', () => {
  it('cuts the request to what is left and says so', async () => {
    // `if (rate + pcnt > 100) rate = 100 - pcnt;` then ADMEN2FA —
    // GEMAIN.C:3539-3560. The budget is charged at the point of SETTING;
    // GEPLANET.C trusts whatever rates it is handed, so a missing clamp lets a
    // colony run eleven items at 100% of one workforce.
    const planet = makePlanet();
    planet.items[I_MEN].rate = 70;
    const h = makeHarness(planet, [makeShip()]);

    const res = await adm(h, 'rate', 'foo', '60');

    expect(planet.items[I_FOOD].rate).toBe(30);
    expect(textOf(res)).toContain(formatMessage(MessageId.ADM_OK));
    expect(textOf(res)).toContain(formatMessage(MessageId.ADMEN2FA, 'food cases', 30));
    // 70 + 30 = 100 exactly, so nothing is left un-assigned.
    expect(textOf(res)).not.toContain('un-assigned');
  });

  it('reports the effort still un-assigned when the request fits', async () => {
    // ADMEN2FB, GEMAIN.C:3563. Un-assigned effort is production a colony is
    // simply not doing; an owner who cannot see it never claims it.
    const planet = makePlanet();
    planet.items[I_MEN].rate = 30;
    const h = makeHarness(planet, [makeShip()]);

    const res = await adm(h, 'rate', 'foo', '20');

    expect(planet.items[I_FOOD].rate).toBe(20);
    expect(textOf(res)).toContain(formatMessage(MessageId.ADMEN2FB, 50));
    expect(textOf(res)).not.toContain('adjusted to');
  });

  it('measures a raise against the OTHER items, not against the old value', async () => {
    // `if (i != warsptr->titem) pcnt += rate` — the slot being set is excluded
    // from the tally (GEMAIN.C:3541). Counting it would make raising 40 to 60
    // look like 100 already spent and refuse every raise in place.
    const planet = makePlanet();
    planet.items[I_FOOD].rate = 40;
    planet.items[I_MEN].rate = 30;
    const h = makeHarness(planet, [makeShip()]);

    await adm(h, 'rate', 'foo', '60');

    expect(planet.items[I_FOOD].rate).toBe(60);
    expect(planet.items[I_MEN].rate).toBe(30);
  });

  it('refuses a rate above 100 outright rather than clamping it', async () => {
    // The handler's own bound, before the budget is consulted: `value > 100`
    // is not a figure canon's menu can produce (it prompts 0-100), and
    // clamping instead of refusing is the bug already fixed once on `adm tax`
    // — a command confirming a value it had not stored.
    const planet = makePlanet();
    const h = makeHarness(planet, [makeShip()]);

    const res = await adm(h, 'rate', 'foo', '101');

    expect(textOf(res)).toContain(formatMessage(MessageId.ADM_INVALID));
    expect(planet.items[I_FOOD].rate).toBe(0);
  });
});

describe('adm takes the item BEFORE the value', () => {
  it('refuses reserve/markup/rate with the arguments the other way round', async () => {
    // `adm reserve 500 foo` reads "500" as the item keyword, which resolves to
    // nothing. Silently accepting the swap would set the reserve of item 5 to
    // whatever "foo" parsed as, or write field zero — and a wrong reserve
    // takes a colony's stock off sale without the owner seeing why.
    const planet = makePlanet();
    const h = makeHarness(planet, [makeShip()]);

    for (const args of [
      ['reserve', '500', 'foo'],
      ['markup', '50', 'foo'],
      ['rate', '20', 'foo'],
    ]) {
      const res = await adm(h, ...args);
      expect(textOf(res)).toContain(formatMessage(MessageId.ADM_INVALID));
    }

    expect(planet.items[I_FOOD].reserve).toBe(0);
    expect(planet.items[I_FOOD].markup2a).toBe(10);
    expect(planet.items[I_FOOD].rate).toBe(0);
  });

  it('stores reserve and markup when the order is right', async () => {
    // The other side of the same branch — proof the refusal above is about the
    // ORDER and not about the command being broken.
    const planet = makePlanet();
    const h = makeHarness(planet, [makeShip()]);

    await adm(h, 'reserve', 'foo', '500');
    await adm(h, 'markup', 'foo', '50');

    expect(planet.items[I_FOOD].reserve).toBe(500);
    expect(planet.items[I_FOOD].markup2a).toBe(50);
  });

  it('refuses a sellflag that is neither on nor off, leaving the item as it was', async () => {
    // `sell` decides whether visitors can buy at all. A third value falling
    // through as false takes the item off the market silently.
    const planet = makePlanet();
    planet.items[I_FOOD].sell = true;
    const h = makeHarness(planet, [makeShip()]);

    const res = await adm(h, 'sellflag', 'foo', 'yes');

    expect(textOf(res)).toContain(formatMessage(MessageId.ADM_INVALID));
    expect(planet.items[I_FOOD].sell).toBe(true);
  });
});

describe('adm tax refuses out of range instead of clamping', () => {
  it('keeps the old rate when the figure is above canon 100', async () => {
    // `if (margc == 1 && amt <= 100) plptr->taxrate = amt;` — GEMAIN.C:3224.
    // The port used to Math.min() first and then answer "Setting saved.",
    // reporting a rate it had not stored. Tax drives the revolt formula, so a
    // rate the owner did not choose costs colonists.
    const planet = makePlanet({ taxrate: 10 });
    const h = makeHarness(planet, [makeShip()]);

    const res = await adm(h, 'tax', '150');

    expect(textOf(res)).toContain(formatMessage(MessageId.ADM_INVALID));
    expect(planet.taxrate).toBe(10);

    await adm(h, 'tax', '100');
    expect(planet.taxrate).toBe(100);
  });
});

describe('adm password is three modes, not one stored word', () => {
  it('sets the team lock from the owner teamcode on "team"', async () => {
    // `if (waruptr->teamcode > 0) plptr->teamcode = waruptr->teamcode;` —
    // GEMAIN.C:3266-3290. Storing the raw word and leaving teamcode at zero
    // left team access inert, so a team-locked colony admitted nobody.
    const planet = makePlanet();
    const h = makeHarness(planet, [makeShip({ teamcode: 7n })]);

    await adm(h, 'password', 'team');

    expect(planet.teamcode).toBe(7n);
    expect(planet.password.toLowerCase()).toBe('team');
  });

  it('clears BOTH fields when a teamless owner asks for "team"', async () => {
    // C's else arm: `plptr->teamcode = 0; plptr->password[0] = 0;`. Leaving
    // the word behind turned it into an ordinary password, so anyone who typed
    // "team" could land on the colony — the exact hole C wipes it to close.
    const planet = makePlanet({ password: 'sesame', teamcode: 3n });
    const h = makeHarness(planet, [makeShip({ teamcode: undefined })]);

    await adm(h, 'password', 'team');

    expect(planet.password).toBe('');
    expect(planet.teamcode).toBe(0n);
  });

  it('drops the team lock when a plain word is set, and again on "none"', async () => {
    // The third arm: any other word is a password and `plptr->teamcode = 0`.
    // A password set over a live team lock must not leave the team able to
    // land without it.
    const planet = makePlanet({ teamcode: 9n });
    const h = makeHarness(planet, [makeShip({ teamcode: 9n })]);

    await adm(h, 'password', 'sesame');
    expect(planet.password).toBe('sesame');
    expect(planet.teamcode).toBe(0n);

    await adm(h, 'password', 'none');
    expect(planet.teamcode).toBe(0n);
    expect(planet.password.toLowerCase()).toBe('none');
  });
});
