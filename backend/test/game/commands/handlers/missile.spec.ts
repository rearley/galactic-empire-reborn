import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { MissileHandlerService } from '../../../../src/game/commands/handlers/missile.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import { cdistance } from '../../../../src/game/combat/combat-math';
import { FIRETICKS, MAXMISSL, MISENGFC, WARP_THRESHOLD } from '../../../../src/game/constants';
import { I_MISSL } from '../../../../src/game/constants/items';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 100000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 1, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_MISSL]: 5n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

interface Harness {
  handler: MissileHandlerService;
  shipMap: Map<string, ShipState>;
}

function makeHarness(
  ships: ShipState[],
  classCfg: Record<number, { hasMissile?: boolean; scanRange?: number }> = {},
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
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100_000_000, maxTons: 5000, hasTorpedo: true, hasMissile: true,
  } as never);
  for (const [cls, cfg] of Object.entries(classCfg)) {
    cache.setForTest(Number(cls), {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: cfg.scanRange ?? 100_000_000, maxTons: 5000,
      hasTorpedo: true, hasMissile: cfg.hasMissile ?? true,
    } as never);
  }

  const events = new EventEmitter2();
  const handler = new MissileHandlerService(shipState, cache, events, new Mulberry32Adapter(42));
  return { handler, shipMap };
}

const ctx: CommandContext = {};

describe('MissileHandlerService — `mis <target> <charge>`', () => {
  it('rejects when ShipClass.hasMissile === false', () => {
    const alice = makeShip({ shpclass: 2 });
    const h = makeHarness([alice], { 2: { hasMissile: false } });
    const result = h.handler.command.handler(alice, ['Bob', '1000'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIS_NOMIS));
  });

  it('rejects charge < 1 (NUMOOR)', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob', '0'], ctx) as CommandResult;
    expect(result.lines[0].text).toContain('out of range');
  });

  it('rejects charge > 50000 (NUMOOR)', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob', '50001'], ctx) as CommandResult;
    expect(result.lines[0].text).toContain('out of range');
  });

  it('rejects with JAMMER4 when firer.jammer > 0', () => {
    const alice = makeShip({ jammer: 5 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob', '1000'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAMMER4));
  });

  it('rejects when items[I_MISSL] <= 0 (MIS_NOAMMO)', () => {
    const alice = makeShip({ items: itemsWith({ [I_MISSL]: 0n }) });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['Bob', '1000'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIS_NOAMMO));
  });

  it('rejects when target has all MAXMISSL slots occupied (MIS_FULL)', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    // bob must be within lock range (~4.93 sectors) so the lock-quality gate passes
    // and we actually reach the slot-full check. Moved from ycoord:100 → ycoord:1.
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 0, ycoord: 1,
      lmisslChannel: [99, 99, 99],
      lmisslDistance: [1000, 2000, 3000],
      lmisslEnergy: [500, 500, 500],
    });
    const h = makeHarness([alice, bob]);
    const result = h.handler.command.handler(alice, ['Bob', '1000'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MIS_FULL));
    expect(MAXMISSL).toBe(3);
  });

  it('happy path — allocates slot on target with channel/distance/energy, deducts cost, sets cantexit', () => {
    const alice = makeShip({
      userid: 'a', shipno: 9, xcoord: 0, ycoord: 0,
      energy: 50000, items: itemsWith({ [I_MISSL]: 4n }),
    });
    // bob must be within lock range (~4.93 sectors). Moved from ycoord:50 → ycoord:1.
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 0, ycoord: 1,
    });
    const h = makeHarness([alice, bob]);

    const charge = 1000;
    const result = h.handler.command.handler(alice, ['Bob', String(charge)], ctx) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);

    // Slot allocated on target
    expect(bob.lmisslChannel[0]).toBe(9);
    const expectedDist = Math.floor(cdistance(alice, bob) * 10000 + 20);
    expect(bob.lmisslDistance[0]).toBe(expectedDist);
    expect(bob.lmisslEnergy[0]).toBe(charge);

    // Energy debited
    expect(alice.energy).toBe(50000 - charge / MISENGFC);
    // Ammo decremented
    expect(alice.items[I_MISSL]).toBe(3n);
    // Battle-lock
    expect(alice.cantexit).toBe(FIRETICKS);
  });

  it('missiles allowed at warp speed (no warp gate)', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 0, ycoord: 0,
      speed: WARP_THRESHOLD,
    });
    // bob must be within lock range (~4.93 sectors). Moved from ycoord:50 → ycoord:1.
    const bob = makeShip({ userid: 'b', shipno: 2, shipname: 'Bob', xcoord: 0, ycoord: 1 });
    const h = makeHarness([alice, bob]);
    const result = h.handler.command.handler(alice, ['Bob', '500'], ctx) as CommandResult;
    // Should not be rejected for warp
    expect(result.lines[0].text).not.toContain('warp');
    expect(bob.lmisslChannel[0]).toBe(1);
  });
});

describe('missile lock + cloak gates (Plan 1 T7)', () => {
  let firer: ShipState;
  let cloaked: ShipState;
  let handler: MissileHandlerService;
  let spawnTarget: (opts: { sectorsAway: number }) => ShipState;

  beforeEach(() => {
    firer = makeShip({ userid: 'f', shipno: 10, shipname: 'Firer', xcoord: 0, ycoord: 0 });
    cloaked = makeShip({ userid: 'c', shipno: 11, shipname: 'Cloaked', xcoord: 0, ycoord: 0, cloak: 0 });

    let nextShipno = 100;
    const allShips: ShipState[] = [firer, cloaked];
    const shipMap = new Map<string, ShipState>();
    for (const s of allShips) shipMap.set(shipKey(s.userid, s.shipno), s);

    spawnTarget = ({ sectorsAway }) => {
      const no = nextShipno++;
      const t = makeShip({
        userid: 't', shipno: no, shipname: `Target${no}`,
        xcoord: sectorsAway, ycoord: 0,
      });
      allShips.push(t);
      shipMap.set(shipKey(t.userid, t.shipno), t);
      return t;
    };

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
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100_000_000, maxTons: 5000, hasTorpedo: true, hasMissile: true,
    } as never);

    const events = new EventEmitter2();
    handler = new MissileHandlerService(shipState, cache, events, new Mulberry32Adapter(42));
  });

  it('refuses to fire while cloaked', () => {
    cloaked.cloak = 10;
    const res = handler.command.handler(cloaked, ['enemy', '5000'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/cloak/i);
  });

  it('fails to lock a target beyond ~4.9 sectors', () => {
    const farTarget = spawnTarget({ sectorsAway: 6 });
    const res = handler.command.handler(firer, [farTarget.shipname, '5000'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/lock/i);
  });

  it('locks a near target', () => {
    const nearTarget = spawnTarget({ sectorsAway: 1 });
    const res = handler.command.handler(firer, [nearTarget.shipname, '5000'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/away/i);
  });
});
