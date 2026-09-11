/**
 * `sys kill` matches the ship record's USERID, as canon does.
 *
 *   for (othusn=0; othusn < nships ; othusn++)
 *     if (genearas(margv[2], warshpoff(othusn)->userid))
 *       { warshpoff(othusn)->damage = 101; ... }
 *   -- GECMDS.C:4801-4813
 *
 * The port matched `ShipState.username` instead. That works for a player,
 * whose display handle is hydrated at board time, and fails for every AI hull,
 * because nothing boards one — so the field is undefined in memory and the
 * filter never matches. `sys kill Cybrg-223` answered "Not found" for a ship
 * plainly listed by `sys list`.
 *
 * Canon has no such split: `username()` returns `ptr->userid` for a player and
 * `ptr->shipname` for an automaton (GEFUNCS.C:2593-2604), and `sys kill` does
 * not call it at all — it reads `userid` off the record. This port separates
 * the login id (`usr_<hex>`, minted at registration) from the display handle,
 * so matching EITHER is what restores canon's single behaviour: the handle
 * covers players, the userid covers AI.
 *
 * Found the first time a sysop tried to remove a surplus AI hull from a live
 * galaxy and had no way to name it.
 */

import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { SysHandlerService } from '../../../../src/game/commands/handlers/sys.handler';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { CybertronControlService } from '../../../../src/game/cybertron/cybertron-control.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    energy: 100000,
    topspeed: 10,
    username: 'Sysop',
    ...over,
  });
}

function makeHarness(ships: ShipState[]) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;
  return new SysHandlerService(
    shipState,
    { user: { update: vi.fn() } } as unknown as PrismaService,
    new CybertronControlService(),
  );
}

const ctx: CommandContext = {};

/** An AI hull as it actually sits in the state map: userid set, username absent. */
function cybertron(userid: string, shipno: number, shipname: string): ShipState {
  const s = makeShip({ userid, shipno, shipname, shpclass: 25, status: 2 });
  delete (s as { username?: string }).username;
  return s;
}

/**
 * `sys class` must reach every class the table defines.
 *
 * The unit test for the validator passed 34 as the class COUNT, which is
 * canon's slot count. The real caller passes the number of DEFINED classes,
 * which is 18, and the bound compared a class NUMBER against it — so with
 * sparse numbering (1-9, 21-25, 31-33, 41) everything above 9 was refused and
 * a sysop could not become any AI hull or the Death Star. The unit test could
 * not see it because it never used the caller's arithmetic.
 *
 * @see GECMDS.C:4882
 */
describe('SysHandlerService — `sys class` reaches the sparse high numbers', () => {
  const saved = process.env.GE_SYSOP_USERNAME;
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'Sysop'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });

  const TABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 21, 22, 23, 24, 25, 31, 32, 33, 41]
    .map((classNumber) => ({ classNumber, maxWarp: 10 }));

  function harnessWithClasses(ships: ShipState[]) {
    const shipMap = new Map<string, ShipState>();
    for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
    const shipState = {
      findAllShips: () => Array.from(shipMap.values()),
      mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
        const s = shipMap.get(shipKey(userid, shipno));
        if (!s) return undefined;
        fn(s); return s;
      },
    } as unknown as ShipStateService;
    const shipClassCache = new ShipClassCacheService({} as never);
    for (const c of TABLE) shipClassCache.setForTest(c.classNumber, { maxAcceleration: 0, maxWarp: c.maxWarp });
    return new SysHandlerService(
      shipState,
      { user: { update: vi.fn() } } as unknown as PrismaService,
      new CybertronControlService(),
      undefined,
      shipClassCache,
    );
  }

  it.each([21, 25, 33, 41])('accepts class %i', async (n) => {
    const sysop = makeShip();
    const h = harnessWithClasses([sysop]);
    await h.command.handler(sysop, ['class', String(n)], ctx);
    expect(sysop.shpclass).toBe(n);
  });

  it('still refuses a number the table does not define', async () => {
    const sysop = makeShip({ shpclass: 1 });
    const h = harnessWithClasses([sysop]);
    await h.command.handler(sysop, ['class', '34'], ctx);
    expect(sysop.shpclass).toBe(1);
  });
});

describe('SysHandlerService — `sys kill`', () => {
  const saved = process.env.GE_SYSOP_USERNAME;
  beforeEach(() => { process.env.GE_SYSOP_USERNAME = 'Sysop'; });
  afterEach(() => {
    if (saved === undefined) delete process.env.GE_SYSOP_USERNAME;
    else process.env.GE_SYSOP_USERNAME = saved;
  });

  it('kills an AI hull named by its userid, which is all a sysop can see', async () => {
    const sysop = makeShip();
    const sob = cybertron('Cybrg-223', 223, 'SOBx949782');
    const h = makeHarness([sysop, sob]);
    const result = await h.command.handler(sysop, ['kill', 'Cybrg-223'], ctx) as CommandResult;
    expect(result.lines[0].text).not.toBe('Not found');
    expect(sob.damage).toBe(101);
  });

  it('still kills a player named by their display handle', async () => {
    // The port's userid is `usr_<hex>`, minted at registration and never shown,
    // so the handle is the only name a sysop could type for a player.
    const sysop = makeShip();
    const victim = makeShip({ userid: 'usr_deadbeef', shipno: 1, username: 'Wasp' });
    const h = makeHarness([sysop, victim]);
    await h.command.handler(sysop, ['kill', 'Wasp'], ctx);
    expect(victim.damage).toBe(101);
  });

  it('leaves everything else alone', async () => {
    const sysop = makeShip();
    const a = cybertron('Cybrg-222', 222, 'SOBx949345');
    const b = cybertron('Cybrg-223', 223, 'SOBx949782');
    const h = makeHarness([sysop, a, b]);
    await h.command.handler(sysop, ['kill', 'Cybrg-223'], ctx);
    expect(b.damage).toBe(101);
    expect(a.damage).toBe(0);
    expect(sysop.damage).toBe(0);
  });

  it('answers "Not found" for a name nothing carries', async () => {
    const sysop = makeShip();
    const h = makeHarness([sysop, cybertron('Cybrg-223', 223, 'SOBx949782')]);
    const result = await h.command.handler(sysop, ['kill', 'Nobody'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe('Not found');
  });

  /**
   * Canon's `genearas` is a PREFIX match and this port keeps that, which makes
   * `sys kill Cybrg-2` a command that kills every automaton in the galaxy at
   * once. That is canon's behaviour and is deliberately not changed here; the
   * case exists so the blast radius is documented rather than discovered.
   */
  it('matches on a PREFIX — a short name is a wide net, exactly as in canon', async () => {
    const sysop = makeShip();
    const a = cybertron('Cybrg-222', 222, 'SOBx949345');
    const b = cybertron('Cybrg-223', 223, 'SOBx949782');
    const h = makeHarness([sysop, a, b]);
    await h.command.handler(sysop, ['kill', 'Cybrg-22'], ctx);
    expect(a.damage).toBe(101);
    expect(b.damage).toBe(101);
  });
});
