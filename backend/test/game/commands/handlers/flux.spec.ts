import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { fluxCommand } from '../../../../src/game/commands/handlers/flux.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { ENGYMAX } from '../../../../src/game/constants';
import { I_FLUX } from '../../../../src/game/constants/items';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 100,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_FLUX]: 2n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

const ctx: CommandContext = {};

describe('fluxCommand — `flux`', () => {
  it('happy path: consumes one pod, restores energy to ENGYMAX', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 2n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(s.items[I_FLUX]).toBe(1n);
    expect(s.energy).toBe(ENGYMAX);
    expect(s.dirty).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FLUX_USED));
  });

  it('rejects when no flux pods (FLUX_NOPODS)', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 0n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(s.items[I_FLUX]).toBe(0n);
    expect(s.energy).toBe(100); // unchanged
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FLUX_NOPODS));
  });

  it('still consumes pod even if energy already at max (no short-circuit)', () => {
    const s = makeShip({ energy: ENGYMAX, items: itemsWith({ [I_FLUX]: 3n }) });
    fluxCommand.handler(s, [], ctx);
    expect(s.items[I_FLUX]).toBe(2n);
    expect(s.energy).toBe(ENGYMAX);
  });
});
