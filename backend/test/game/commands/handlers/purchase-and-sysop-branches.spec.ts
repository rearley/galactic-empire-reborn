/**
 * The two commands that move money and hand out power: `new` (Zygor's
 * shipyard) and `sys` (the sysop toolkit).
 *
 * Round one covered the happy paths of both. What remains uncovered is almost
 * entirely REFUSALS and the arithmetic behind them — and a refusal that stops
 * refusing is the expensive direction of failure here: a free hull, a phaser
 * beyond the class cap, a teleport outside the galaxy, `sys kill` with an empty
 * needle taking every ship in the game.
 *
 * Canon: GECMDS.C:4554-4730 (cmd_new) and GECMDS.C:4742-4990 (cmd_sysop).
 *
 * Every case here asserts resulting STATE — the fake Prisma below keeps a real
 * balance and a real ship table, and the fake ShipStateService really applies
 * its mutate callback — rather than that a mock was called.
 */
import {
  NewShipHandlerService,
  PHASER_PRICE,
} from '../../../../src/game/commands/handlers/new-ship.handler';
import { SysHandlerService } from '../../../../src/game/commands/handlers/sys.handler';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import type { Random } from '../../../../src/game/combat/random.port';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { CybertronControlService } from '../../../../src/game/cybertron/cybertron-control.service';
import { MAXSHIPS, UNIVMAX } from '../../../../src/game/constants';
import { NUMITEMS, I_TORP } from '../../../../src/game/constants/items';

const ctx: CommandContext = {};

/** Zygor is plnum 1, and `where = 10 + plnum`. @see GECMDS.C:4557 */
const AT_ZYGOR = 11;

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'usr_buyer', shipno: 1, shipname: 'Test', shpclass: 4,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 65000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: AT_ZYGOR, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array<bigint>(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 7, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    username: 'Sysop',
    dirty: false, ...over,
  } as ShipState;
}

interface FakeClass {
  classNumber: number;
  typeName: string;
  category: string;
  maxPrice: bigint;
  maxWarp: number;
  maxPhaser: number;
  maxShields: number;
}

const DESTROYER: FakeClass = {
  classNumber: 4, typeName: 'Destroyer', category: 'PLAYER',
  maxPrice: 600_000n, maxWarp: 7, maxPhaser: 5, maxShields: 5,
};
const SCOW: FakeClass = {
  classNumber: 31, typeName: 'Lydorian Scow', category: 'DROID',
  maxPrice: 1n, maxWarp: 3, maxPhaser: 1, maxShields: 1,
};

interface FakeDb {
  /** null models a user row that has gone missing under the command. */
  user: { userid: string; cash: bigint; noships: number; topshipno: number } | null;
  ships: Record<string, unknown>[];
  /** Force the conditional debit to lose its race, as a concurrent buy would. */
  raceLost: boolean;
}

function makeDb(over: Partial<FakeDb> = {}): FakeDb {
  return {
    user: { userid: 'usr_buyer', cash: 1_000_000n, noships: 1, topshipno: 1 },
    ships: [],
    raceLost: false,
    ...over,
  };
}

/** A Prisma stand-in that keeps real state, so cases can assert the balance. */
function makePrisma(db: FakeDb, classes: FakeClass[] = [DESTROYER, SCOW]): PrismaService {
  const prisma = {
    shipClass: {
      findMany: async () => classes,
      findFirst: async (args: { where: { classNumber: number } }) =>
        classes.find((c) => c.classNumber === args.where.classNumber) ?? null,
    },
    user: {
      findUnique: async () => db.user,
      update: async (args: { data: { cash?: { increment?: bigint; decrement?: bigint } } }) => {
        if (!db.user) throw new Error('no such user');
        const c = args.data.cash;
        if (c?.increment !== undefined) db.user.cash += c.increment;
        if (c?.decrement !== undefined) db.user.cash -= c.decrement;
        return db.user;
      },
      updateMany: async (args: {
        where: { cash: { gte: bigint }; noships: { lt: number } };
        data: { cash: { decrement: bigint }; noships: { increment: number }; topshipno: number };
      }) => {
        if (!db.user) return { count: 0 };
        if (db.raceLost) return { count: 0 };
        if (db.user.cash < args.where.cash.gte) return { count: 0 };
        if (db.user.noships >= args.where.noships.lt) return { count: 0 };
        db.user.cash -= args.data.cash.decrement;
        db.user.noships += args.data.noships.increment;
        db.user.topshipno = args.data.topshipno;
        return { count: 1 };
      },
    },
    ship: {
      create: async (args: { data: Record<string, unknown> }) => {
        db.ships.push(args.data);
        return args.data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return prisma as unknown as PrismaService;
}

/** A ShipStateService stand-in whose `mutate` really mutates. */
function makeShipState(ships: ShipState[]): ShipStateService {
  const map = new Map<string, ShipState>();
  for (const s of ships) map.set(shipKey(s.userid, s.shipno), s);
  return {
    findAllShips: () => Array.from(map.values()),
    loadShip: async () => undefined,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = map.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      return s;
    },
  } as unknown as ShipStateService;
}

const textOf = (r: CommandResult): string => r.lines.map((l) => l.text).join('\n');

// ---------------------------------------------------------------------------
// A) `new` — the shipyard at Zygor
// ---------------------------------------------------------------------------

describe('NewShipHandlerService — purchase refusals that protect the wallet', () => {
  function harness(db: FakeDb, ship: ShipState, classes?: FakeClass[]) {
    const service = new NewShipHandlerService(makePrisma(db, classes), makeShipState([ship]), { bySector: () => [] } as unknown as PlanetStateService, { next: () => 0.5 } as Random);
    return (args: string[]) => service.command.handler(ship, args, ctx) as Promise<CommandResult>;
  }

  /**
   * `new` dispatches on a subcommand and canon's cmd_new answers nothing else.
   * Falling through to the purchase path on an unrecognised word would make
   * `new shp 4` a silent no-op or, worse, a class listing that looks like a
   * failed buy. @see GECMDS.C:4554
   *
   * Breaks if: the `sub !== 'ship'` guard is removed (line 160) — the command
   * would then list classes instead of printing usage.
   */
  it('answers usage for a subcommand that is not ship/phaser/shield', async () => {
    const db = makeDb();
    const run = harness(db, makeShip());

    const res = await run(['shp', '4']);

    expect(res.lines[0].text).toMatch(/USAGE: new ship/);
    expect(db.ships).toHaveLength(0);
    expect(db.user?.cash).toBe(1_000_000n);
  });

  /**
   * `new ship four` must not be read as class NaN and then looked up. The
   * lookup would return null and refuse anyway, but the explicit NaN test is
   * what keeps `new ship 4x` from being silently accepted as 4 — parseInt
   * stops at the first non-digit.
   *
   * Breaks if: the isNaN guard (line 223) is dropped and findFirst is asked
   * for classNumber NaN — no ship is created either way, but the case also
   * pins that NOTHING is charged, which a lenient parse would change.
   */
  it('refuses a non-numeric class without touching the balance', async () => {
    const db = makeDb();
    const run = harness(db, makeShip());

    const res = await run(['ship', 'four']);

    expect(res.lines[0].text).toMatch(/invalid ship class/i);
    expect(db.ships).toHaveLength(0);
    expect(db.user?.cash).toBe(1_000_000n);
  });

  /**
   * The buyer's row is read for cash and fleet counters before anything is
   * spent. If it cannot be read, the defaults must be the CAUTIOUS ones:
   * cash 0, so the purchase is refused. Leaving `cash` undefined instead makes
   * `cash < maxPrice` false and hands out a free hull.
   *
   * Breaks if: `userRow?.cash ?? 0n` (line 246) loses its fallback or gains a
   * non-zero one — the ship table would then grow a row for free.
   */
  it('treats a missing user row as no money, not as unlimited money', async () => {
    const db = makeDb({ user: null });
    const run = harness(db, makeShip());

    const res = await run(['ship', '4']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW4, 'Destroyer'));
    expect(db.ships).toHaveLength(0);
  });

  /**
   * The cash check before the transaction is advisory; the binding one is the
   * conditional `updateMany` inside it, which re-tests the balance and the
   * fleet cap in the same statement that spends and increments them. When it
   * matches nothing — someone else spent the money first — the purchase must
   * roll back and answer NEW4, not create the hull.
   *
   * @see GECMDS.C:4562-4572, docs/audits/2026-09-09-security-review.md M1
   *
   * Breaks if: `if (count === 0) throw new InsufficientFundsError()` (line 500)
   * is removed, or the catch at line 302 stops recognising it — the ship row
   * would be created without the debit, which is a free hull for anyone who can
   * issue two buys at once.
   */
  it('creates no hull when the conditional debit loses its race', async () => {
    const db = makeDb({ raceLost: true });
    const run = harness(db, makeShip());

    const res = await run(['ship', '4']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW4, 'Destroyer'));
    expect(db.ships).toHaveLength(0);
    expect(db.user?.cash).toBe(1_000_000n);
    expect(db.user?.noships).toBe(1);
  });

  /**
   * The fleet cap is enforced in the same conditional statement. A captain at
   * MAXSHIPS with money in the bank must keep the money.
   *
   * Breaks if: `noships: { lt: MAXSHIPS }` leaves the WHERE clause (line 493)
   * AND the advisory check above it is also relaxed; the case is written
   * through the real caller so both must hold.
   */
  it('keeps the money when the fleet is already full', async () => {
    const db = makeDb({ user: { userid: 'usr_buyer', cash: 1_000_000n, noships: MAXSHIPS, topshipno: MAXSHIPS } });
    const run = harness(db, makeShip());

    const res = await run(['ship', '4']);

    expect(res.lines[0].text).toBe(formatMessage(MessageId.NEW_FLEET_FULL, MAXSHIPS));
    expect(db.ships).toHaveLength(0);
    expect(db.user?.cash).toBe(1_000_000n);
  });

  /**
   * A successful buy leaves the yard with Mark-1 phasers and Mark-1 shields,
   * because canon's `new ship` runs the same `initshp` a first-time pilot's
   * hull runs: `shieldtype = 1; phasrtype = 1`.
   * @see GECMDS.C:4572, GEFUNCS.C:233-234
   *
   * Also pins the money: exactly maxPrice leaves the account, once.
   *
   * Breaks if: the phasrtype/shieldtype literals in createShipTransaction go
   * back to the column default of 0 (a hull with no weapons and no shields), or
   * the debit amount changes.
   */
  it('a bought hull arrives at Mark-1 and costs exactly its list price', async () => {
    const db = makeDb();
    const run = harness(db, makeShip());

    await run(['ship', '4']);

    expect(db.ships).toHaveLength(1);
    expect(db.ships[0]['phasrtype']).toBe(1);
    expect(db.ships[0]['shieldtype']).toBe(1);
    expect(db.ships[0]['topspeed']).toBe(DESTROYER.maxWarp);
    expect(db.user?.cash).toBe(400_000n);
    expect(db.user?.noships).toBe(2);
  });
});

describe('NewShipHandlerService — upgrade gates and the arithmetic behind them', () => {
  function harness(db: FakeDb, ship: ShipState) {
    const service = new NewShipHandlerService(makePrisma(db), makeShipState([ship]), { bySector: () => [] } as unknown as PlanetStateService, { next: () => 0.5 } as Random);
    return (args: string[]) => service.command.handler(ship, args, ctx) as Promise<CommandResult>;
  }

  /**
   * The class ceiling. `maxPhaser` / `maxShields` are per-hull limits from the
   * ship class table, and a Destroyer that could fit a Mark-19 phaser would be
   * strictly better than every hull above it — the whole upgrade economy is
   * the class table's to bound.
   *
   * Breaks if: `newType > classMax` (line 382) is weakened to `>=`/removed —
   * the captain would be charged and re-armed beyond the hull's limit.
   */
  it('refuses a phaser above the hull class maximum, charging nothing', async () => {
    const db = makeDb();
    const ship = makeShip({ phasrtype: 1 });
    const run = harness(db, ship);

    const res = await run(['phaser', '6']); // Destroyer maxPhaser is 5

    expect(res.lines[0].text).toBe('Your ship class cannot exceed phaser type 5.');
    expect(ship.phasrtype).toBe(1);
    expect(db.user?.cash).toBe(1_000_000n);
  });

  /**
   * Re-fitting the Mark you already carry is a no-op, not a purchase. Without
   * the guard the yard quotes a trade-in against the same price and charges the
   * 1000 C minimum install for nothing.
   *
   * Breaks if: the `newType === currentType` short-circuit (line 385) is
   * removed — cash would drop and the "already have" line would vanish.
   */
  it('refuses to re-sell the shield already fitted', async () => {
    const db = makeDb();
    const ship = makeShip({ shieldtype: 3 });
    const run = harness(db, ship);

    const res = await run(['shield', '3']);

    expect(res.lines[0].text).toBe('You already have shield type 3.');
    expect(db.user?.cash).toBe(1_000_000n);
    expect(ship.shieldtype).toBe(3);
  });

  /**
   * The shield half of the "cannot afford" branch, which prints NEW8 where the
   * phaser half prints NEW11. Canon tests `delta <= cash` AFTER quoting the
   * trade-in, so the captain still learns what the old unit was worth.
   * @see GECMDS.C:4609-4612 (NEW8), :4671-4674 (NEW11)
   *
   * Breaks if: the kind ternary at line 438 is flipped (shields would speak the
   * phaser's line), or the affordability test is inverted — a broke captain
   * would be fitted and driven negative.
   */
  it('refuses a shield the captain cannot pay for, and says so in the shield wording', async () => {
    const db = makeDb({ user: { userid: 'usr_buyer', cash: 1_000n, noships: 1, topshipno: 1 } });
    const ship = makeShip({ shieldtype: 1 });
    const run = harness(db, ship);

    const res = await run(['shield', '5']);

    const text = textOf(res);
    expect(text).toContain(formatMessage(MessageId.NEW8, 5));
    expect(text).not.toMatch(/Yardmaster/);
    expect(ship.shieldtype).toBe(1);
    expect(db.user?.cash).toBe(1_000n);
  });

  /**
   * A hull whose phasrtype is 0 — hulls created before the Mark-1 fix, and any
   * hull whose type is cleared — has NOTHING to trade in. The quote must charge
   * the full list price rather than indexing `priceTable[-1]`.
   * @see GECMDS.C:4664 `if (delta > 0) ... else delta = 0`
   *
   * Breaks if: the `currentType > 0` ternary at line 65 goes away —
   * `PHASER_PRICE[-1]` is undefined and the arithmetic throws, or, with a
   * wraparound index, the captain is credited for equipment they never had.
   */
  it('charges full list price when there is no old phaser to trade in', async () => {
    const db = makeDb();
    const ship = makeShip({ phasrtype: 0 });
    const run = harness(db, ship);

    const res = await run(['phaser', '2']);

    expect(textOf(res)).not.toMatch(/credit us/);
    expect(ship.phasrtype).toBe(2);
    expect(db.user?.cash).toBe(1_000_000n - PHASER_PRICE[1]); // 10,000 list, no trade-in
  });

  /**
   * The in-memory state is what the combat tick reads; the DB row is caught up
   * later by the flush. A fitting that debits the account and does not move
   * `phasrtype` is money for nothing, and one that writes the wrong FIELD
   * re-fits the other system.
   *
   * Breaks if: the two assignments inside the mutate callback (line 453) are
   * swapped or one is dropped.
   */
  it('a phaser fitting moves phasrtype only, and takes the net cost', async () => {
    const db = makeDb();
    const ship = makeShip({ phasrtype: 1, shieldtype: 1 });
    const run = harness(db, ship);

    // 1 -> 3: trade-in 5000 - 5000/3 = 3334; cost 40000 - 3334 = 36666.
    await run(['phaser', '3']);

    expect(ship.phasrtype).toBe(3);
    expect(ship.shieldtype).toBe(1);
    expect(ship.dirty).toBe(true);
    expect(db.user?.cash).toBe(1_000_000n - 36_666n);
  });

  it('a shield fitting moves shieldtype only', async () => {
    const db = makeDb();
    const ship = makeShip({ phasrtype: 1, shieldtype: 1 });
    const run = harness(db, ship);

    // 1 -> 2: trade-in 3334; cost 10000 - 3334 = 6666.
    await run(['shield', '2']);

    expect(ship.shieldtype).toBe(2);
    expect(ship.phasrtype).toBe(1);
    expect(db.user?.cash).toBe(1_000_000n - 6_666n);
  });

  /**
   * A downgrade pays back, less canon's credit/50 transaction fee, and the
   * unit is still fitted at a cost of zero.
   * @see GECMDS.C:4676-4686 (NEW28)
   *
   * phaser 3 -> 1: trade-in 40000 - 13333 = 26667; delta 5000 - 26667 =
   * -21667; fee 21667/50 = 433; deposited 21234.
   *
   * Breaks if: the increment/decrement ternary at line 448 is inverted (the
   * refund would be TAKEN), or the fee divisor moves — this asserts the
   * resulting balance, not the call.
   */
  it('deposits a downgrade refund net of the credit/50 fee', async () => {
    const db = makeDb({ user: { userid: 'usr_buyer', cash: 0n, noships: 1, topshipno: 1 } });
    const ship = makeShip({ phasrtype: 3 });
    const run = harness(db, ship);

    await run(['phaser', '1']);

    expect(db.user?.cash).toBe(21_234n);
    expect(ship.phasrtype).toBe(1);
  });

  /**
   * `new phaser` with no type is the price list a captain decides from. It must
   * mark what is currently fitted and must show a DOWNGRADE as a refund rather
   * than as a price — a list that quotes 5,000 for dropping to a Mark-1 when
   * the yard would in fact pay 21,234 is worse than no list.
   *
   * Breaks if: the `credit > 0n` test at line 368 becomes a cost test, or the
   * `t === currentType` marker at line 367 moves.
   */
  it('the price list marks the fitted Mark and prices a downgrade as a refund', async () => {
    const db = makeDb();
    const ship = makeShip({ phasrtype: 3 });
    const run = harness(db, ship);

    const res = await run(['phaser']);

    const rows = res.lines.map((l) => l.text);
    expect(rows[0]).toContain('current type: 3');
    expect(rows[0]).toContain('class max: 5');
    expect(rows.find((t) => t.trim().startsWith('1 '))).toContain('-21,234 cr (refund)');
    expect(rows.find((t) => t.trim().startsWith('3 '))).toContain('◄');
    expect(rows.find((t) => t.trim().startsWith('4 '))).toContain('cr');
    expect(rows.find((t) => t.trim().startsWith('4 '))).not.toContain('refund');
    // The list is a quote, not a purchase.
    expect(db.user?.cash).toBe(1_000_000n);
    expect(ship.phasrtype).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// B) `sys` — the sysop toolkit
// ---------------------------------------------------------------------------

describe('SysHandlerService — the subcommands that mint, move and destroy', () => {
  const saved = process.env.GE_SYSOP_USERNAME;
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'Sysop'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });

  function harness(ships: ShipState[], db: FakeDb = makeDb(), cyb = new CybertronControlService()) {
    const service = new SysHandlerService(makeShipState(ships), makePrisma(db), cyb);
    return {
      /** The caller defaults to the first ship — the sysop issuing the command. */
      run: (args: string[], ship: ShipState = ships[0]) =>
        service.command.handler(ship, args, ctx) as Promise<CommandResult>,
      db,
      cyb,
    };
  }

  const HUH = formatMessage(MessageId.SYS_HUH);

  /**
   * `sys get nnn <itemname>` matches canon's three-letter keyword table
   * (`genearas(kwrd[i],margv[3])`, GECMDS.C:4788), so `tor` is torpedoes. The
   * items array is cargo: a wrong index arms the wrong thing, and an
   * unresolvable keyword must create nothing at all.
   *
   * Breaks if: the keyword lookup at line 212 stops resolving prefixes, or the
   * `index < 0` refusal at line 213 is dropped — `items[-1]` would be written.
   */
  it('sys get resolves the canon keyword and adds to the existing stock', async () => {
    const sysop = makeShip({ items: new Array<bigint>(NUMITEMS).fill(0n) });
    sysop.items[I_TORP] = 4n;
    const { run } = harness([sysop]);

    const res = await run(['get', '6', 'tor']);

    expect(sysop.items[I_TORP]).toBe(10n);
    expect(res.lines[0].text).toBe('Created 6 torpedos.');
  });

  it('sys get refuses an unknown item and creates nothing', async () => {
    const sysop = makeShip();
    const before = [...sysop.items];
    const { run } = harness([sysop]);

    const res = await run(['get', '6', 'zzz']);

    expect(res.lines[0].text).toBe(HUH);
    expect(sysop.items).toEqual(before);
  });

  /**
   * Canon guards the item grant with `if ((amt = atol(margv[2])) > 0)`
   * (GECMDS.C:4790) — items are unsigned cargo, and a negative would underflow
   * a hold rather than empty it.
   *
   * Breaks if: the `amt <= 0` half of the guard at line 210 is removed.
   */
  it('sys get refuses a negative amount', async () => {
    const sysop = makeShip();
    sysop.items[I_TORP] = 4n;
    const { run } = harness([sysop]);

    const res = await run(['get', '-3', 'tor']);

    expect(res.lines[0].text).toBe(HUH);
    expect(sysop.items[I_TORP]).toBe(4n);
  });

  /**
   * `sys cash nnn` is `waruptr->cash += atol(margv[2])` (GECMDS.C:4822) — a
   * signed add, so removing credits is as legitimate as granting them. What is
   * NOT legitimate is a garbled argument reaching BigInt(): the balance must be
   * untouched.
   *
   * Breaks if: the `amt === null` refusal at line 228 goes away (BigInt(NaN)
   * throws, taking the command down), or the increment loses its sign handling.
   */
  it('sys cash adds and subtracts, and refuses a non-integer outright', async () => {
    const sysop = makeShip();
    const { run, db } = harness([sysop]);

    await run(['cash', '5000']);
    expect(db.user?.cash).toBe(1_005_000n);

    await run(['cash', '-2000']);
    expect(db.user?.cash).toBe(1_003_000n);

    const res = await run(['cash', 'lots']);
    expect(res.lines[0].text).toBe(HUH);
    expect(db.user?.cash).toBe(1_003_000n);
  });

  /**
   * `sys goto x y` teleports and CENTRES the ship in the sector
   * (`coord.xcoord = (double)i + .5`, GECMDS.C:4836), clears the orbit
   * (`where = 0`) and the hostile flag.
   *
   * Canon tests only the upper bound; this port checks both edges, a deviation
   * recorded on `sysGotoIsValid`. Either way a sector outside the galaxy must
   * not be reachable: a ship parked beyond the perimeter is off every scan and
   * outside the perimeter logic that would bring it back.
   *
   * Breaks if: the bounds test at line 239 is removed, or the `+ 0.5` centring
   * is dropped (the hull lands on a sector corner, up to 7,071 units from where
   * the sysop meant to be).
   */
  it('sys goto centres the ship in the target sector and drops orbit', async () => {
    const sysop = makeShip({ where: AT_ZYGOR, hostile: 1 });
    const { run } = harness([sysop]);

    const res = await run(['goto', '5', '-7']);

    expect(sysop.xcoord).toBe(5.5);
    expect(sysop.ycoord).toBe(-6.5);
    expect(sysop.where).toBe(0);
    expect(sysop.hostile).toBe(0);
    expect(res.lines[0].text).toBe('Teleported to sector 5 -7.');
  });

  it('sys goto refuses a sector outside the galaxy and leaves the ship put', async () => {
    const sysop = makeShip({ xcoord: 0.5, ycoord: 0.5, where: AT_ZYGOR });
    const { run } = harness([sysop]);

    const res = await run(['goto', String(UNIVMAX + 1), '0']);

    expect(res.lines[0].text).toBe(HUH);
    expect(sysop.xcoord).toBe(0.5);
    expect(sysop.ycoord).toBe(0.5);
    expect(sysop.where).toBe(AT_ZYGOR);
  });

  /**
   * `sys shieldtype` and `sys phasertype` are two arms of one handler
   * (GECMDS.C:4892, :4903). Writing the wrong field silently re-fits the other
   * system, which in a fight is the difference between absorbing a shot and
   * taking it.
   *
   * Breaks if: the `which === 'shieldtype'` branch at line 271 is inverted or
   * either assignment is dropped.
   */
  it('sys phasertype and sys shieldtype write their own field and no other', async () => {
    const sysop = makeShip({ phasrtype: 1, shieldtype: 1 });
    const { run } = harness([sysop]);

    await run(['phasertype', '9']);
    expect(sysop.phasrtype).toBe(9);
    expect(sysop.shieldtype).toBe(1);

    await run(['shieldtype', '7']);
    expect(sysop.shieldtype).toBe(7);
    expect(sysop.phasrtype).toBe(9);
  });

  /**
   * `sys kill` is a PREFIX match over every ship in the galaxy (canon's
   * `genearas`, GECMDS.C:4807). An empty needle is a prefix of EVERY name, so
   * without the guard `sys kill` with no argument — a plausible typo, and what
   * a trailing space produces — sets damage 101 on the entire galaxy, the
   * sysop's own hull included.
   *
   * Breaks if: the `!target` refusal at line 289 is removed.
   */
  it('sys kill with no name kills nothing at all', async () => {
    const sysop = makeShip({ userid: 'usr_sysop', shipno: 1 });
    const victim = makeShip({ userid: 'usr_wasp', shipno: 2, username: 'Wasp' });
    const { run } = harness([sysop, victim]);

    const res = await run(['kill']);

    expect(res.lines[0].text).toBe(HUH);
    expect(victim.damage).toBe(0);
    expect(sysop.damage).toBe(0);
  });

  /**
   * `sys cybpause nnn` suspends the Cybertron tick for n seconds
   * (canon's `cybhaltflg`, GECMDS.C:4972). A garbled argument must be refused
   * BEFORE `pauseFor` is called: `pauseFor(NaN)` truncates to 0, which CLEARS a
   * pause that is currently protecting whatever the sysop paused it for.
   *
   * Breaks if: the `secs === null` refusal at line 197 is removed — the typo
   * would silently restart the Cybertrons.
   */
  it('sys cybpause with a garbled argument does not cancel an existing pause', async () => {
    const sysop = makeShip();
    const { run, cyb } = harness([sysop]);

    await run(['cybpause', '60']);
    expect(cyb.isPaused()).toBe(true);

    const res = await run(['cybpause', 'soon']);

    expect(res.lines[0].text).toBe(HUH);
    expect(cyb.isPaused()).toBe(true);
  });
});
