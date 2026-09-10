import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { LockHandlerService } from '../../../../src/game/commands/handlers/lock.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { NOLOCK_SENTINEL } from '../../../../src/game/commands/helpers/find-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alice', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: NOLOCK_SENTINEL, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHarness(
  ships: ShipState[],
  scanRange = 100_000_000,
  letters: ReadonlyArray<{ shipKey: string; letter: string }> = [],
) {
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
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange, maxTons: 5000,
  } as never);
  return new LockHandlerService(shipState, cache,
      { lettersFor: () => letters } as unknown as ScanHandlerService,
    );
}

const ctx: CommandContext = {};

describe('LockHandlerService — `loc <target>`', () => {
  it('happy path: sets ship.lock to target.shipno', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice' });
    const bob = makeShip({ userid: 'b', shipno: 7, shipname: 'Bob', xcoord: 100, ycoord: 100 });
    const h = makeHarness([alice, bob]);
    const result = h.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(alice.lock).toBe(7);
    // LOCK02 names the ship AND its commander — canon passes username() as the
    // second arg (GECMDS.C:5093). The old assertion pinned an invented string.
    expect(result.lines[0].text).toMatch(/Fire control locked on Bob commanded by/);
  });

  /**
   * Canon compares the RESOLVED target to the caller — `if (shpnum == usrnum)
   * prfmsg(FOOLISH)` (GECMDS.C:1150) — AFTER findshp has turned the argument
   * into a ship. It never matches on a name, and since findshp resolves by
   * scan letter and your own hull is not in your own scan table, the check is
   * all but unreachable.
   *
   * The port put a name-prefix self-test BEFORE resolution, so any letter that
   * happened to begin the caller's own ship name became permanently unusable
   * as a target. A pilot flying "BigCat" could never `loc B`, whatever B was
   * on their scan, and got "That would be foolish Sir!" for a Cyberquad
   * eighteen thousand units away. `sca sh B` worked the whole time, which is
   * what made it look like nonsense. Reported from play 2026-09-09.
   */
  it('locks the letter, not the caller, when the letter starts their own ship name', () => {
    const me = makeShip({ userid: 'me', shipno: 1, shipname: 'BigCat' });
    const quad = makeShip({ userid: 'Cybrg-9', shipno: 9, shipname: 'Cyberquad 44135', status: 2 });
    const h = makeHarness([me, quad], 100_000_000, [{ shipKey: shipKey(quad.userid, quad.shipno), letter: 'B' }]);
    const result = h.command.handler(me, ['B'], ctx) as CommandResult;
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.LOC_SELF));
    expect(result.lines[0].text).toMatch(/locked on/i);
  });

  it('still refuses a name that really is the caller, with no letter in play', () => {
    const me = makeShip({ userid: 'me', shipno: 1, shipname: 'BigCat' });
    const h = makeHarness([me]);
    const result = h.command.handler(me, ['BigCat'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LOC_SELF));
  });

  it('rejects locking onto self (LOC_SELF)', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice' });
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['Alice'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LOC_SELF));
    expect(alice.lock).toBe(NOLOCK_SENTINEL);
  });

  it('rejects when target not found in scan range', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice' });
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['Ghost'], ctx) as CommandResult;
    // findShip returns "No such ship: Ghost." — handler surfaces it as system line.
    expect(result.lines[0].category).toBe('system');
    expect(alice.lock).toBe(NOLOCK_SENTINEL);
  });

  it('rejects when ship.jammer > 0 (JAMMER4)', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', jammer: 5 });
    const bob = makeShip({ userid: 'b', shipno: 7, shipname: 'Bob', xcoord: 100, ycoord: 100 });
    const h = makeHarness([alice, bob]);
    const result = h.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAMMER4));
    expect(alice.lock).toBe(NOLOCK_SENTINEL);
  });

  it('@ shorthand: validates existing lock and confirms', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', lock: 7 });
    const bob = makeShip({ userid: 'b', shipno: 7, shipname: 'Bob', xcoord: 100, ycoord: 100 });
    const h = makeHarness([alice, bob]);
    const result = h.command.handler(alice, ['@'], ctx) as CommandResult;
    // LOCK02 names the ship AND its commander — canon passes username() as the
    // second arg (GECMDS.C:5093). The old assertion pinned an invented string.
    expect(result.lines[0].text).toMatch(/Fire control locked on Bob commanded by/);
    expect(alice.lock).toBe(7);
  });

  it('@ shorthand: stale lock (target gone) — clears lock and returns NOLOCK message', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', lock: 99 });
    const h = makeHarness([alice]);
    const result = h.command.handler(alice, ['@'], ctx) as CommandResult;
    expect(alice.lock).toBe(NOLOCK_SENTINEL);
    expect(result.lines[0].category).toBe('system');
  });

  // Fix 1 — FCBROKE lock gate (@see GECMDS.C:1346-1351 lockon)
  it('rejects with FCBROKE when firecntl > 0 (before jammer gate)', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', firecntl: 3 });
    const bob = makeShip({ userid: 'b', shipno: 7, shipname: 'Bob', xcoord: 100, ycoord: 100 });
    const h = makeHarness([alice, bob]);
    const result = h.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FCBROKE));
    expect(alice.lock).toBe(NOLOCK_SENTINEL); // lock unchanged
  });

  it('firecntl=0: FCBROKE gate does not block loc command', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', firecntl: 0 });
    const bob = makeShip({ userid: 'b', shipno: 7, shipname: 'Bob', xcoord: 100, ycoord: 100 });
    const h = makeHarness([alice, bob]);
    const result = h.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.FCBROKE));
    expect(alice.lock).toBe(7);
  });
});

/**
 * Bare `loc` releases the fire-control lock.
 *
 *   if (margc == 1) {
 *       warsptr->lock = -1;
 *       prfmsg(LOCK01);
 *       outprfge(ALWAYS,usrnum);
 *       return;
 *   }
 *
 * @see GECMDS.C:5073-5079 cmd_lock
 * @see GE/REL/MBMGEMSG.MSG:5839 LOCK01 {***\nFire control Lock removed!}
 *
 * This is the FIRST thing cmd_lock does, ahead of every other gate. The port
 * declared `minArgs: 1`, so a bare `loc` was answered with a usage line and
 * there was no way to release a lock at all short of acquiring another one —
 * which matters because a live lock is what `tor` and `mis` fire down, and
 * what makes `cantexit` keep re-arming.
 */
describe('bare `loc` clears the lock (GECMDS.C:5073)', () => {
  it('releases the lock and says so', () => {
    const ship = makeShip({ lock: 4, lockKey: 'u2:4' });
    const svc = makeHarness([ship]);

    const res = svc.command.handler(ship, [], {} as CommandContext) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.LOC_CLEARED));
    expect({ lock: ship.lock, lockKey: ship.lockKey })
      .toEqual({ lock: NOLOCK_SENTINEL, lockKey: null });
  });

  it('works even with fire control shot out — canon clears before every gate', () => {
    // cmd_lock's margc==1 arm returns before any other test. Releasing a lock
    // is not an act of targeting, so a broken scanner cannot block it.
    const ship = makeShip({ lock: 4, lockKey: 'u2:4', firecntl: 5 });
    const svc = makeHarness([ship]);

    const res = svc.command.handler(ship, [], {} as CommandContext) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.LOC_CLEARED));
    expect(ship.lock).toBe(NOLOCK_SENTINEL);
  });

  it('works while jammed, for the same reason', () => {
    const ship = makeShip({ lock: 4, lockKey: 'u2:4', jammer: 30 });
    const svc = makeHarness([ship]);

    const res = svc.command.handler(ship, [], {} as CommandContext) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.LOC_CLEARED));
  });

  it('is a no-op message when there was no lock to clear', () => {
    const ship = makeShip();
    const svc = makeHarness([ship]);

    const res = svc.command.handler(ship, [], {} as CommandContext) as CommandResult;

    expect(res.lines[0].text).toBe(formatMessage(MessageId.LOC_CLEARED));
    expect(ship.lock).toBe(NOLOCK_SENTINEL);
  });
});
