import { CommandResult } from '../../../src/game/commands/command.types';
import { WarpHandlerService } from '../../../src/game/commands/handlers/warp.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';

/**
 * Five-outcome (six counting WARPSPD2) gate test for the `warp` command.
 * Mirrors the gate sequence in `GECMDS.C:561-650 cmd_warp` and FR-012.
 *
 * Cases: WARP01 (no warp class), WARPSPD2 (engines blown), WARP02 (negative),
 *        WARP03 (hard cap), WARP04 (overspeed warning + apply), normal apply.
 */

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
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 6, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function build(maxWarpByClass: Record<number, number>) {
  const cache = new ShipClassCacheService({} as any);
  for (const [c, w] of Object.entries(maxWarpByClass)) {
    cache.setForTest(Number(c), { maxAcceleration: 1000, maxWarp: w });
  }
  return new WarpHandlerService(cache);
}

describe('warp gate sequence (FR-012)', () => {
  it('WARP01 — class.maxWarp = 0 refuses', () => {
    const h = build({ 1: 0 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const r = h.command.handler(ship, ['3'], {}) as CommandResult;
    expect(r.lines[0].text).toBe(formatMessage(MessageId.WARP01));
    expect(ship.speed2b).toBe(0);
  });

  it('WARPSPD2 — warp-capable class with topspeed = 0 refuses', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 0 });
    const r = h.command.handler(ship, ['3'], {}) as CommandResult;
    expect(r.lines[0].text).toBe(formatMessage(MessageId.WARPSPD2));
    expect(ship.speed2b).toBe(0);
  });

  it('WARP02 — negative refuses', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const r = h.command.handler(ship, ['-3'], {}) as CommandResult;
    expect(r.lines[0].text).toBe(formatMessage(MessageId.WARP02));
    expect(ship.speed2b).toBe(0);
  });

  it('WARP03 — > topspeed + floor(topspeed/2) refuses', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const r = h.command.handler(ship, ['10'], {}) as CommandResult;
    expect(r.lines[0].text).toBe(formatMessage(MessageId.WARP03));
    expect(ship.speed2b).toBe(0);
  });

  it('WARP04 — > topspeed but ≤ hard cap warns and applies', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const r = h.command.handler(ship, ['8'], {}) as CommandResult;
    expect(r.lines.some((l) => l.text === formatMessage(MessageId.WARP04, 6))).toBe(true);
    expect(ship.speed2b).toBe(8000);
  });

  it('normal — ≤ topspeed applies without warning', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 6 });
    const r = h.command.handler(ship, ['5'], {}) as CommandResult;
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].category).toBe('success');
    expect(ship.speed2b).toBe(5000);
  });
});
