import { CommandResult } from '../../../src/game/commands/command.types';
import { WarpHandlerService } from '../../../src/game/commands/handlers/warp.handler';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

/**
 * Five-outcome (six counting WARPSPD2) gate test for the `warp` command.
 * Mirrors the gate sequence in `GECMDS.C:561-650 cmd_warp` and FR-012.
 *
 * Cases: WARP01 (no warp class), WARPSPD2 (engines blown), WARP02 (negative),
 *        WARP03 (hard cap), WARP04 (overspeed warning + apply), normal apply.
 */

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    topspeed: 6,
    ...overrides,
  });
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

/**
 * `war <speed> [degrees]` — the course argument.
 *
 * GECMDS.C:cmd_warp reads a second argument through `valdegree`, defaulting to
 * "0", then turns to `normal(heading + degrees)` and prints ENGFIRE with the
 * resulting course:
 *
 *   if (margc == 3) strcpy(gechrbuf, margv[2]); else strcpy(gechrbuf, "0");
 *   if (warsptr->helm == 0 && valdegree(gechrbuf)) {
 *     deg = (unsigned)normal(warsptr->heading + (double)warsptr->degrees);
 *     warsptr->speed2b = 1000.0 * speed;
 *     warsptr->head2b  = (double)deg;
 *   }
 *
 * The port read only the speed and hard-set `head2b = heading`, so firing
 * engines always meant "straight ahead" — `war 6 45` silently flew the old
 * course. That is the natural way to fly in the original, and it also means a
 * pending `rot` is discarded by a bare `war`, which IS correct (degrees
 * defaults to 0), but only because C makes the same choice deliberately.
 *
 * `imp` already handled this (impulse.handler.ts:44); warp did not.
 */
describe('warp course argument — GECMDS.C:cmd_warp', () => {
  it('turns to a relative course given alongside the speed', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 100, head2b: 100 });
    h.command.handler(ship, ['6', '45'], {});
    expect(ship.head2b).toBe(145);
  });

  it('wraps past 360', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 350, head2b: 350 });
    h.command.handler(ship, ['6', '30'], {});
    expect(ship.head2b).toBe(20);
  });

  it('accepts a negative relative course', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 10, head2b: 10 });
    h.command.handler(ship, ['6', '-30'], {});
    expect(ship.head2b).toBe(340);
  });

  it('holds the current heading when no course is given', () => {
    // C defaults the argument to "0", so a bare `war` means straight ahead.
    const h = build({ 1: 10 });
    // head2b == heading: this ship is flying straight, not mid-turn. A bare
  // `war` holds a turn already ordered (head2b != heading), so a fixture that
  // disagreed with itself would exercise that path instead of this one.
  const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 174, head2b: 174 });
    h.command.handler(ship, ['6'], {});
    expect(ship.head2b).toBe(174);
  });

  it('refuses a course outside -180..180 and does not fire the engines', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 0, head2b: 0, speed2b: 0 });
    const r = h.command.handler(ship, ['6', '400'], {}) as CommandResult;
    expect(r.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, -180, 180));
    expect(ship.speed2b).toBe(0);
  });

  it('names the resulting course in the confirmation', () => {
    const h = build({ 1: 10 });
    const ship = makeShip({ shpclass: 1, topspeed: 10, heading: 100, head2b: 100 });
    const r = h.command.handler(ship, ['6', '45'], {}) as CommandResult;
    expect(r.lines.some((l) => l.text.includes('145'))).toBe(true);
  });
});
