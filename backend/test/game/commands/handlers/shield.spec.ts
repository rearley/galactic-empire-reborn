import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { shieldCommand } from '../../../../src/game/commands/handlers/shield.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
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
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 10, warncntr: 0,
    dirty: false, ...over,
  };
}

const ctx: CommandContext = {};

describe('shieldCommand — `shi up|dn`', () => {
  it('shi up sets shieldstat = 1', () => {
    const s = makeShip({ shieldstat: 0 });
    const result = shieldCommand.handler(s, ['up'], ctx) as CommandResult;
    expect(s.shieldstat).toBe(1);
    expect(s.dirty).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHI_UP));
  });

  it('shi dn sets shieldstat = 0', () => {
    const s = makeShip({ shieldstat: 1 });
    const result = shieldCommand.handler(s, ['dn'], ctx) as CommandResult;
    expect(s.shieldstat).toBe(0);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHI_DN));
  });

  it('shi down also accepted', () => {
    const s = makeShip({ shieldstat: 1 });
    shieldCommand.handler(s, ['down'], ctx);
    expect(s.shieldstat).toBe(0);
  });

  it('unknown subcommand returns SHI_FMT', () => {
    const s = makeShip({ shieldstat: 1 });
    const result = shieldCommand.handler(s, ['bogus'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHI_FMT));
    expect(s.shieldstat).toBe(1); // unchanged
  });
});
