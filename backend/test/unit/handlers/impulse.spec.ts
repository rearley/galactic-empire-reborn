import { CommandResult } from '../../../src/game/commands/command.types';
import { impulseCommand } from '../../../src/game/commands/handlers/impulse.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 270, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

describe('impulseCommand', () => {
  it('success path within [0,99] mutates percent and speed2b', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['50'], ctx) as CommandResult;
    expect(ship.percent).toBe(50);
    expect(ship.speed2b).toBeCloseTo(500.0);
    expect(result.lines[0].category).toBe('success');
  });

  it('success path emits ENGFIRE with current heading', () => {
    const ship = makeShip({ heading: 270 });
    const result = impulseCommand.handler(ship, ['50'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ENGFIRE, 270));
  });

  it('success path sets dirty=true', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['50'], ctx);
    expect(ship.dirty).toBe(true);
  });

  it('value 0 is accepted (boundary)', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['0'], ctx) as CommandResult;
    expect(ship.percent).toBe(0);
    expect(ship.speed2b).toBe(0);
    expect(result.lines[0].category).toBe('success');
  });

  it('value 99 is accepted (boundary)', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['99'], ctx) as CommandResult;
    expect(ship.percent).toBe(99);
    expect(result.lines[0].category).toBe('success');
  });

  it('value 200 returns NUMOOR (out of range)', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['200'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, 0, 99));
    expect(result.lines[0].category).toBe('system');
    expect(ship.dirty).toBe(false);
  });

  it('value -1 returns NUMOOR', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['-1'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, 0, 99));
    expect(ship.dirty).toBe(false);
  });

  it('non-numeric "abc" returns NUMOOR', () => {
    const ship = makeShip();
    const result = impulseCommand.handler(ship, ['abc'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, 0, 99));
    expect(ship.dirty).toBe(false);
  });

  it('keyword is "impulse", alias includes "imp"', () => {
    expect(impulseCommand.keyword).toBe('impulse');
    expect(impulseCommand.aliases).toContain('imp');
  });

  it('argMissingMessage contains IMPFMT text', () => {
    expect(impulseCommand.argMissingMessage).toBe(formatMessage(MessageId.IMPFMT));
  });

  it('speed2b is 1000 * (value / 100)', () => {
    const ship = makeShip();
    impulseCommand.handler(ship, ['75'], ctx);
    expect(ship.speed2b).toBeCloseTo(750.0);
  });
});
