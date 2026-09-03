import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { MissileHandlerService } from '../../../../src/game/commands/handlers/missile.handler';
import { DecoyHandlerService } from '../../../../src/game/commands/handlers/decoy.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import { DECOYTIME, MAXDECOY, MISENGFC } from '../../../../src/game/constants';
import { I_DECOY, I_MISSL } from '../../../../src/game/constants/items';

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
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_MISSL]: 5n, [I_DECOY]: 3n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  };
}

function makeShipState(ships: ShipState[]): ShipStateService {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
  return {
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
}

function makeMissileHandler(ships: ShipState[]): MissileHandlerService {
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100_000_000, maxTons: 5000, hasTorpedo: true, hasMissile: true,
  } as never);
  return new MissileHandlerService(
    makeShipState(ships), cache, new EventEmitter2(), new Mulberry32Adapter(42),
  );
}

const ctx: CommandContext = {};

/**
 * MISSHRT — "Sorry Sir! There is not that much energy in our neutron flux pile."
 * @see GECMDS.C:1278-1285   @see GE/REL/MBMGEMSG.MSG:3735
 */
const MISSHRT = 'Sorry Sir! There is not that much energy in our neutron flux pile.';

describe('mis — MISSHRT flux-pile gate (GECMDS.C:1278-1285)', () => {
  it('refuses when charge/MISENGFC >= energy + MOVENGMIN', () => {
    // energy 100 ⇒ ceiling is 3100 flux ⇒ charge 310_000 would be needed, but
    // charge is capped at 50_000 (500 flux). So drive energy negative-ish low.
    const alice = makeShip({ energy: 100, xcoord: 1, ycoord: 0 });
    const bob = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeMissileHandler([alice, bob]);
    // 50_000/100 = 500 flux; 500 >= 100+3000 is false → this one must FIRE.
    const ok = h.command.handler(alice, ['Bob', '50000'], ctx) as CommandResult;
    expect(ok.lines.some((l) => l.text === MISSHRT)).toBe(false);
  });

  it('refuses once the pile is deep enough in the red', () => {
    const alice = makeShip({ energy: -2600, xcoord: 1, ycoord: 0 });
    const bob = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeMissileHandler([alice, bob]);
    // 50_000/100 = 500 flux; 500 >= (-2600 + 3000 = 400) → MISSHRT.
    const result = h.command.handler(alice, ['Bob', '50000'], ctx) as CommandResult;
    expect(result.lines.some((l) => l.text === MISSHRT)).toBe(true);
    // and nothing was spent
    expect(alice.items[I_MISSL]).toBe(5n);
    expect(bob.lmisslDistance[0] ?? 0).toBe(0);
  });

  it('is checked AFTER the ammo gate — an empty rack says NOMISSL, not MISSHRT', () => {
    const alice = makeShip({ energy: -2600, xcoord: 1, ycoord: 0, items: itemsWith({ [I_MISSL]: 0n }) });
    const bob = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeMissileHandler([alice, bob]);
    const result = h.command.handler(alice, ['Bob', '50000'], ctx) as CommandResult;
    expect(result.lines.some((l) => l.text === formatMessage(MessageId.MIS_NOAMMO))).toBe(true);
    expect(result.lines.some((l) => l.text === MISSHRT)).toBe(false);
  });

  it('debits the TRUNCATED flux cost, not the fractional one', () => {
    const alice = makeShip({ energy: 100000, xcoord: 1, ycoord: 0 });
    const bob = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bob', xcoord: 1, ycoord: 1 });
    const h = makeMissileHandler([alice, bob]);
    h.command.handler(alice, ['Bob', '199'], ctx);
    // 199/100 truncates to 1 in C, not 1.99
    expect(alice.energy).toBe(100000 - 1);
    expect(MISENGFC).toBe(100);
  });
});

/**
 * DECOY1  @see GE/REL/MBMGEMSG.MSG:2745
 * PCLOKUP @see GE/REL/MBMGEMSG.MSG:2155
 * DECMANY @see GE/REL/MBMGEMSG.MSG:2737
 */
const DECOY1 = 'We would simply waste the decoy while in hyperspace Sir!';
const PCLOKUP = 'We cannot do that while the cloaking device is on, Sir!';
const DECMANY = 'We already have 10 decoy ships out Sir!';

describe('dec — canon refusals (GECMDS.C:1552-1585)', () => {
  it('refuses in hyperspace (where === 1) with DECOY1', () => {
    const alice = makeShip({ where: 1 });
    const h = new DecoyHandlerService(makeShipState([alice]), { getHasDecoy: () => true } as never);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(DECOY1);
    expect(alice.items[I_DECOY]).toBe(3n);
  });

  it('refuses while cloaked with PCLOKUP', () => {
    const alice = makeShip({ cloak: 1 });
    const h = new DecoyHandlerService(makeShipState([alice]), { getHasDecoy: () => true } as never);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(PCLOKUP);
    expect(alice.items[I_DECOY]).toBe(3n);
  });

  it('the hyperspace gate is checked before the cloak gate', () => {
    const alice = makeShip({ where: 1, cloak: 1 });
    const h = new DecoyHandlerService(makeShipState([alice]), { getHasDecoy: () => true } as never);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(DECOY1);
  });

  it('refuses an 11th decoy with DECMANY instead of growing the array', () => {
    const alice = makeShip({
      decout: new Array<number>(MAXDECOY).fill(DECOYTIME),
      items: itemsWith({ [I_DECOY]: 3n }),
    });
    const h = new DecoyHandlerService(makeShipState([alice]), { getHasDecoy: () => true } as never);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(DECMANY);
    expect(alice.decout.length).toBe(MAXDECOY);
    expect(alice.items[I_DECOY]).toBe(3n);
  });

  it('still deploys normally when nothing blocks it', () => {
    const alice = makeShip();
    const h = new DecoyHandlerService(makeShipState([alice]), { getHasDecoy: () => true } as never);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DEC_DEPLOYED));
    expect(alice.decout[0]).toBe(DECOYTIME);
  });
});

/**
 * DECOY0 — the hull has no decoy launcher.
 *
 * `if (!shipclass[warsptr->shpclass].has_decoy) { prfmsg(DECOY0); return; }` is
 * the FIRST thing cmd_decoy does (GECMDS.C:1545-1550), before the hyperspace
 * and cloak gates. It was missing entirely, so any class carrying decoys as
 * cargo could launch them.
 */
describe('dec — no launcher fitted (GECMDS.C:1545-1550)', () => {
  const noLauncher = { getHasDecoy: () => false } as never;

  it('refuses with DECOY0 and spends nothing', () => {
    const alice = makeShip({});
    const h = new DecoyHandlerService(makeShipState([alice]), noLauncher);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe("We don't have a decoy system on this tub, Sir!");
    expect(alice.items[I_DECOY]).toBe(3n);
  });

  it('is checked before the hyperspace gate, as it is in the C', () => {
    const alice = makeShip({ where: 1 });
    const h = new DecoyHandlerService(makeShipState([alice]), noLauncher);
    const result = h.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe("We don't have a decoy system on this tub, Sir!");
  });
});
