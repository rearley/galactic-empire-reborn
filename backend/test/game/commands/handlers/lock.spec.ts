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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[], scanRange = 100_000_000) {
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
      { lettersFor: () => [] } as unknown as ScanHandlerService,
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
