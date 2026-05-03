import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { DecoyHandlerService } from '../../../../src/game/commands/handlers/decoy.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { DECOYTIME } from '../../../../src/game/constants';
import { I_DECOY } from '../../../../src/game/constants/items';

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
    items: itemsWith({ [I_DECOY]: 3n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    dirty: false, ...over,
  };
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

  return new DecoyHandlerService(shipState);
}

const ctx: CommandContext = {};

describe('DecoyHandlerService — `dec`', () => {
  it('happy path — sets lowest empty slot to DECOYTIME, decrements ammo', () => {
    const alice = makeShip({ decout: [0, 0, 0] });
    const handler = makeHarness([alice]);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DEC_DEPLOYED));
    expect(alice.decout[0]).toBe(DECOYTIME);
    expect(alice.items[I_DECOY]).toBe(2n);
  });

  it('fills lowest zero slot when earlier slots in use', () => {
    const alice = makeShip({ decout: [DECOYTIME, 0, DECOYTIME] });
    const handler = makeHarness([alice]);
    handler.command.handler(alice, [], ctx);
    expect(alice.decout[1]).toBe(DECOYTIME);
  });

  it('rejects when items[I_DECOY] <= 0 (DEC_NOAMMO)', () => {
    const alice = makeShip({ items: itemsWith({ [I_DECOY]: 0n }) });
    const handler = makeHarness([alice]);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.DEC_NOAMMO));
  });
});
