import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { JammerHandlerService } from '../../../../src/game/commands/handlers/jammer.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { JAMTIME } from '../../../../src/game/constants';
import { I_JAMMER } from '../../../../src/game/constants/items';

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
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_JAMMER]: 3n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    dirty: false, ...over,
  };
}

function makeHarness(ships: ShipState[], scanRange = 10000) {
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

  return new JammerHandlerService(shipState, cache);
}

const ctx: CommandContext = {};

describe('JammerHandlerService — `jam`', () => {
  it('happy path — applies jammer to all ships in scan range, including self', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 0, ycoord: 5000 });
    const handler = makeHarness([alice, bob], 10000);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAM_FIRED));
    // bob distance 5000, scanRange 10000 → JAMTIME * 0.5 = 10
    expect(bob.jammer).toBe(Math.floor(JAMTIME * 0.5));
    // alice (self, distance 0) → JAMTIME
    expect(alice.jammer).toBe(JAMTIME);
    expect(alice.items[I_JAMMER]).toBe(2n);
  });

  it('rejects when items[I_JAMMER] <= 0 (JAM_NOAMMO)', () => {
    const alice = makeShip({ items: itemsWith({ [I_JAMMER]: 0n }) });
    const handler = makeHarness([alice]);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAM_NOAMMO));
  });

  it('distance scaling — ship at scanrange/2 gets floor(JAMTIME * 0.5); self gets JAMTIME', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 5000, ycoord: 0 });
    const carol = makeShip({ userid: 'c', shipno: 3, xcoord: 20000, ycoord: 0 }); // outside
    const handler = makeHarness([alice, bob, carol], 10000);
    handler.command.handler(alice, [], ctx);
    expect(alice.jammer).toBe(JAMTIME);
    expect(bob.jammer).toBe(Math.floor(JAMTIME * 0.5));
    expect(carol.jammer).toBe(0); // out of range
  });
});
