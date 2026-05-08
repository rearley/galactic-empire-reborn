import { CommandResult } from '../../../src/game/commands/command.types';
import { rotateCommand } from '../../../src/game/commands/handlers/rotate.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

describe('rotateCommand', () => {
  it('success path mutates degrees and returns NOWTURN', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['90'], ctx) as CommandResult;
    expect(ship.degrees).toBe(90);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, 90));
    expect(result.lines[0].category).toBe('success');
  });

  it('success path sets dirty=true', () => {
    const ship = makeShip();
    rotateCommand.handler(ship, ['45'], ctx);
    expect(ship.dirty).toBe(true);
  });

  it('negative degrees mutates correctly (-90)', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['-90'], ctx) as CommandResult;
    expect(ship.degrees).toBe(-90);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, -90));
  });

  it('out-of-range (181) returns NUMOOR', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['181'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, -180, 180));
    expect(result.lines[0].category).toBe('system');
    expect(ship.dirty).toBe(false);
  });

  it('out-of-range (-181) returns NUMOOR', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['-181'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, -180, 180));
    expect(ship.dirty).toBe(false);
  });

  it('non-numeric input "abc" returns NUMOOR', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['abc'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, -180, 180));
    expect(ship.dirty).toBe(false);
  });

  it('keyword is "rotate", alias includes "rot"', () => {
    expect(rotateCommand.keyword).toBe('rotate');
    expect(rotateCommand.aliases).toContain('rot');
  });

  it('argMissingMessage contains ROTFMT text', () => {
    expect(rotateCommand.argMissingMessage).toBe(formatMessage(MessageId.ROTFMT));
  });

  it('boundary: 180 accepted', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['180'], ctx) as CommandResult;
    expect(ship.degrees).toBe(180);
    expect(result.lines[0].category).toBe('success');
  });

  it('boundary: -180 accepted', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['-180'], ctx) as CommandResult;
    expect(ship.degrees).toBe(-180);
    expect(result.lines[0].category).toBe('success');
  });
});
