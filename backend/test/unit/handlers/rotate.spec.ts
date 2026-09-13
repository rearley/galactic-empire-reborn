import { CommandResult } from '../../../src/game/commands/command.types';
import { rotateCommand } from '../../../src/game/commands/handlers/rotate.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
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

  it('success path sets dirty=true', async () => {
    const ship = makeShip();
    await rotateCommand.handler(ship, ['45'], ctx);
    expect(ship.dirty).toBe(true);
  });

  it('negative degrees mutates correctly (-90)', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['-90'], ctx) as CommandResult;
    expect(ship.degrees).toBe(-90);
    // C reports the heading you end up on, not the delta:
    // `deg = normal(heading + degrees)` (GECMDS.C:705). From heading 0 that is
    // 270. This previously asserted "-90", pinning the delta the port printed.
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, 270));
  });

  it('turns to an absolute compass heading with C\'s @ form', () => {
    const ship = makeShip();
    ship.heading = 101;
    const result = rotateCommand.handler(ship, ['@208'], ctx) as CommandResult;
    expect(ship.head2b).toBe(208);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, 208));
  });

  it('rejects an absolute heading off the compass, quoting 0-359', () => {
    const ship = makeShip();
    const result = rotateCommand.handler(ship, ['@360'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, 0, 359));
    expect(ship.dirty).toBe(false);
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

// ─── C-010: Helm gate ─────────────────────────────────────────────────────────

describe('C-010 — rotate: helm gate (HLBROKE)', () => {
  it('helm !== 0 → returns HLBROKE, heading unchanged', () => {
    const ship = makeShip({ helm: -3, heading: 45, head2b: 45, degrees: 0 });
    const result = rotateCommand.handler(ship, ['90'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.HLBROKE));
    expect(result.lines[0].category).toBe('system');
    expect(ship.head2b).toBe(45);  // unchanged
    expect(ship.degrees).toBe(0);  // unchanged
    expect(ship.dirty).toBe(false); // not mutated
  });

  it('helm = 0 → rotate proceeds normally', () => {
    const ship = makeShip({ helm: 0 });
    const result = rotateCommand.handler(ship, ['90'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NOWTURN, 90));
  });
});
