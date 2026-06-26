import { CommandResult } from '../../../src/game/commands/command.types';
import { WarpHandlerService } from '../../../src/game/commands/handlers/warp.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';

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
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 6, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

function makeHandler(maxWarpByClass: Record<number, number> = { 1: 10 }) {
  const cache = new ShipClassCacheService({} as any);
  for (const [cls, maxWarp] of Object.entries(maxWarpByClass)) {
    cache.setForTest(Number(cls), { maxAcceleration: 1000, maxWarp });
  }
  return new WarpHandlerService(cache);
}

describe('warpCommand (full gate sequence)', () => {
  it('class.maxWarp === 0 returns WARP01 regardless of topspeed', () => {
    const h = makeHandler({ 1: 0 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const result = h.command.handler(ship, ['5'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARP01));
    expect(ship.dirty).toBe(false);
  });

  it('warp-capable class but topspeed === 0 returns WARPSPD2', () => {
    const h = makeHandler({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 0 });
    const result = h.command.handler(ship, ['5'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARPSPD2));
    expect(ship.dirty).toBe(false);
  });

  it('topspeed=6 and input 10 (> 1.5x) returns WARP03', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['10'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARP03));
    expect(ship.dirty).toBe(false);
  });

  it('topspeed=6 and input 7 (> max but ≤ 1.5x) returns WARP04 warning AND applies', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['7'], ctx) as CommandResult;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARP04, 6));
    expect(result.lines[0].category).toBe('system');
    expect(result.lines[1].category).toBe('success');
    expect(ship.speed2b).toBeCloseTo(7000.0);
    expect(ship.dirty).toBe(true);
  });

  it('topspeed=6 and input 5 (within range) returns ENGFIRE only', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['5'], ctx) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('success');
    expect(ship.speed2b).toBeCloseTo(5000.0);
    expect(ship.dirty).toBe(true);
  });

  it('input -1 returns WARP02', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['-1'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARP02));
    expect(ship.dirty).toBe(false);
  });

  it('non-numeric input returns WARPFMT', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['fast'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WARPFMT));
    expect(ship.dirty).toBe(false);
  });

  it('keyword is "warp", alias includes "war"', () => {
    const h = makeHandler();
    expect(h.command.keyword).toBe('warp');
    expect(h.command.aliases).toContain('war');
  });

  it('argMissingMessage contains WARPFMT text', () => {
    const h = makeHandler();
    expect(h.command.argMissingMessage).toBe(formatMessage(MessageId.WARPFMT));
  });

  it('speed2b is 1000 * speed (warp, not impulse percentage)', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    h.command.handler(ship, ['3'], ctx);
    expect(ship.speed2b).toBeCloseTo(3000.0);
  });

  it('topspeed=6, speed 9 (exactly at boundary 6 + floor(6/2) = 9) is accepted with WARP04', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['9'], ctx) as CommandResult;
    expect(result.lines.some(l => l.text === formatMessage(MessageId.WARP04, 6))).toBe(true);
    expect(ship.dirty).toBe(true);
  });

  it('ENGFIRE message announces acceleration to the requested warp', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6, heading: 180 });
    const result = h.command.handler(ship, ['4'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe('Engines fired. Accelerating to warp 4.');
  });

  it('dirty is false when validation fails (WARP03)', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    h.command.handler(ship, ['10'], ctx);
    expect(ship.dirty).toBe(false);
  });

  it('speed 0 is accepted (stop warp)', () => {
    const h = makeHandler();
    const ship = makeShip({ topspeed: 6 });
    const result = h.command.handler(ship, ['0'], ctx) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('success');
    expect(ship.speed2b).toBeCloseTo(0);
    expect(ship.dirty).toBe(true);
  });
});
