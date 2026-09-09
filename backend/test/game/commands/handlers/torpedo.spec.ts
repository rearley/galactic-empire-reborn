import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { TorpedoHandlerService } from '../../../../src/game/commands/handlers/torpedo.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import { cdistance } from '../../../../src/game/combat/combat-math';
import { FIRETICKS, MAXTORPS, SE100DAM, WARP_THRESHOLD } from '../../../../src/game/constants';
import { I_TORP } from '../../../../src/game/constants/items';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 1, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_TORP]: 5n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    // Firer identity is the unique `channel` (this port's usrnum), not
    // `shipno`. These fixtures give each ship a distinct shipno, so mirror it.
    channel: over.channel ?? over.shipno ?? 1,
  };
}

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

interface Harness {
  handler: TorpedoHandlerService;
  shipMap: Map<string, ShipState>;
  cache: ShipClassCacheService;
}

function makeHarness(
  ships: ShipState[],
  classCfg: Record<number, { hasTorpedo?: boolean; hasMissile?: boolean; scanRange?: number }> = {},
): Harness {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (userid: string, shipno: number) => shipMap.get(shipKey(userid, shipno)),
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
    maxAcceleration: 1000,
    maxWarp: 10,
    maxPhaser: 1000,
    scanRange: 100_000_000,
    maxTons: 5000,
    hasTorpedo: true,
    hasMissile: true,
  } as never);
  for (const [cls, cfg] of Object.entries(classCfg)) {
    cache.setForTest(Number(cls), {
      maxAcceleration: 1000,
      maxWarp: 10,
      maxPhaser: 1000,
      scanRange: cfg.scanRange ?? 100_000_000,
      maxTons: 5000,
      hasTorpedo: cfg.hasTorpedo ?? true,
      hasMissile: cfg.hasMissile ?? true,
    } as never);
  }

  const events = new EventEmitter2();
  const handler = new TorpedoHandlerService(shipState, cache, events, new Mulberry32Adapter(42),
      { lettersFor: () => [] } as unknown as ScanHandlerService,
    );
  return { handler, shipMap, cache };
}

const ctx: CommandContext = {};

describe('TorpedoHandlerService — `tor <target>`', () => {
  it('rejects when ShipClass.hasTorpedo === false', () => {
    const alice = makeShip({ shpclass: 2 });
    const h = makeHarness([alice], { 2: { hasTorpedo: false } });
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_NOTOR));
    expect(alice.dirty).toBe(false);
  });

  /**
   * Canon's TORP2 is the HYPERSPACE refusal — "That would simply waste a
   * torpedo in hyperspace Sir!" — gated on `warsptr->where == 1`
   * (GECMDS.C:1118). The port wired that message to the firer's SPEED
   * instead, which invented a rule canon does not have and hid the rule it
   * does. A pilot at warp 1 was refused, told they were in hyperspace, and
   * meanwhile could fire freely while actually in hyperspace.
   *
   * Cost a Dreadnought in play: the pilot held sub-warp believing warp made
   * torpedoes impossible for BOTH sides, which is half right. It stops you
   * being HIT (`if (wptr->speed > 999) fact = 0`), and it never stopped you
   * firing.
   */
  it('rejects in hyperspace, which is what canon TORP2 actually says', () => {
    const alice = makeShip({ where: 1 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_HYPERSPACE));
  });

  /**
   * The other half of the same correction. Canon puts no gate on the FIRER's
   * speed at all — it prices speed into the lock instead:
   * `fact = (1.2 - (firer+target)/5000) * ((5-dist)/tor_fact)`. At warp 1 a
   * pilot can still lock out to 2.2 sectors. @see GECMDS.C:1378-1395
   */
  it('allows firing at warp 1 — canon prices speed into the lock, it does not forbid it', () => {
    const alice = makeShip({ speed: 1_000 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.TOR_HYPERSPACE));
  });

  it('rejects when ship.cloak > 0 (TOR_CLOAK)', () => {
    const alice = makeShip({ cloak: 1 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_CLOAK));
  });

  it('rejects when items[I_TORP] <= 0 (TOR_NOAMMO)', () => {
    const alice = makeShip({ items: itemsWith({ [I_TORP]: 0n }) });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_NOAMMO));
  });

  it('rejects with JAMMER4 when firer.jammer > 0', () => {
    const alice = makeShip({ jammer: 5 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAMMER4));
  });

  it('rejects when target has all MAXTORPS slots occupied (TOR_FULL)', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 1, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1,
      // All 3 torpedo slots already occupied (channel != 255)
      ltorpsChannel: [99, 99, 99],
      ltorpsDistance: [1000, 2000, 3000],
    });
    const h = makeHarness([alice, bob]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TOR_FULL));
    expect(MAXTORPS).toBe(3);
  });

  it('happy path — allocates lowest free slot on target, decrements ammo, drops shields, sets cantexit', () => {
    const alice = makeShip({
      userid: 'a', shipno: 7, xcoord: 1, ycoord: 0,
      shieldstat: 1, items: itemsWith({ [I_TORP]: 3n }),
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 1, ycoord: 1, // distance 1 sector — well within lock range
    });
    const h = makeHarness([alice, bob]);

    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);

    // Slot allocated on target
    expect(bob.ltorpsChannel[0]).toBe(7);
    const expectedDist = Math.floor(cdistance(alice, bob) * 10000 + 20);
    expect(bob.ltorpsDistance[0]).toBe(expectedDist);

    // Ammo decremented
    expect(alice.items[I_TORP]).toBe(2n);
    // Shields auto-down
    expect(alice.shieldstat).toBe(0);
    // Battle-lock
    expect(alice.cantexit).toBe(FIRETICKS);
  });

  it('firing from inside the neutral zone self-zaps and does not lock (Plan 1 T8)', () => {
    const firer = makeShip({
      userid: 'a', shipno: 1, xcoord: 0, ycoord: 0,
      items: itemsWith({ [I_TORP]: 1n }),
    });
    const h = makeHarness([firer]);
    const res = h.handler.command.handler(firer, ['Bob'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/Enforcer Planet/i);
    expect(firer.damage).toBeGreaterThanOrEqual(SE100DAM);
    expect(firer.cantexit).toBe(FIRETICKS);
    // No target lock allocated — firer returned early
    expect(firer.ltorpsChannel.length).toBe(0);
  });

  it('happy path — allocates into first free slot when others occupied', () => {
    const alice = makeShip({ userid: 'a', shipno: 5, xcoord: 1, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1,
      ltorpsChannel: [99, 255, 100],
      ltorpsDistance: [1000, 0, 2000],
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['Bob'], ctx);
    expect(bob.ltorpsChannel[1]).toBe(5);
  });

  // Fix 1 — FCBROKE lock gate (@see GECMDS.C:1346-1351 lockon firecntl check)
  it('rejects with FCBROKE when firecntl > 0 (fire control damaged)', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 1, ycoord: 0,
      firecntl: 5, items: itemsWith({ [I_TORP]: 3n }),
    });
    const bob = makeShip({ userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeHarness([alice, bob]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FCBROKE));
    // No torpedo should be allocated
    expect(bob.ltorpsChannel.length).toBe(0);
  });

  it('firecntl=0: FCBROKE gate does not block (proceeds to lock)', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 1, ycoord: 0,
      firecntl: 0, items: itemsWith({ [I_TORP]: 3n }),
    });
    const bob = makeShip({ userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeHarness([alice, bob]);
    const result = h.handler.command.handler(alice, ['Bob'], ctx) as CommandResult;
    // Should NOT be FCBROKE — should proceed and succeed
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.FCBROKE));
    expect(bob.ltorpsChannel[0]).toBe(1);
  });
});
