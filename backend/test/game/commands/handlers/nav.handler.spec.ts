/**
 * T009 — Unit tests for NavHandlerService.
 * TDD red phase: nav.handler.ts does not exist yet — tests are expected to FAIL.
 *
 * @see GECMDS.C:5120 cmd_navigate
 * @see specs/016-navigation-spy/contracts/nav-command.md
 */
import { NavHandlerService } from '../../../../src/game/commands/handlers/nav.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { UNIVMAX } from '../../../../src/game/constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(shipOverrides: Partial<ShipState> = {}) {
  const state = makeShip(shipOverrides);

  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(state);
        return state;
      },
    ),
  } as unknown as ShipStateService;

  const handler = new NavHandlerService(mockShipState);
  const ctx: CommandContext = {};
  return { handler, state, mockShipState, ctx };
}

// ---------------------------------------------------------------------------
// Status form — nav with no args
// ---------------------------------------------------------------------------

describe('NavHandlerService — status form (no args)', () => {

});

// ---------------------------------------------------------------------------
// NAVFMT rejection cases
// ---------------------------------------------------------------------------

describe('NavHandlerService — NAVFMT rejection', () => {
  it('wrong arg count (1 arg) → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('wrong arg count (3 args) → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['5', '5', '5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('non-integer x → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['abc', '5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('non-integer y → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['5', '3.7'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('x > UNIVMAX → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, [String(UNIVMAX + 1), '5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('x < -UNIVMAX → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, [String(-(UNIVMAX + 1)), '5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('y > UNIVMAX → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['5', String(UNIVMAX + 1)], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('y < -UNIVMAX → NAVFMT', () => {
    const { handler, state, ctx } = makeService();
    const result = handler.command.handler(state, ['5', String(-(UNIVMAX + 1))], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.NAVFMT));
  });

  it('boundary: x === UNIVMAX (15) → accepted (not rejected)', () => {
    const { handler, state, ctx } = makeService({ xcoord: 0.0, ycoord: 0.0 });
    const result = handler.command.handler(state, [String(UNIVMAX), '5'], ctx) as { lines: { text: string }[] };
    // Should NOT return NAVFMT
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.NAVFMT));
  });

  it('boundary: x === -UNIVMAX (-15) → accepted (not rejected)', () => {
    const { handler, state, ctx } = makeService({ xcoord: 0.0, ycoord: 0.0 });
    const result = handler.command.handler(state, [String(-UNIVMAX), '5'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.NAVFMT));
  });

  it('boundary: y === UNIVMAX (15) → accepted (not rejected)', () => {
    const { handler, state, ctx } = makeService({ xcoord: 0.0, ycoord: 0.0 });
    const result = handler.command.handler(state, ['5', String(UNIVMAX)], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.NAVFMT));
  });

  it('boundary: y === -UNIVMAX (-15) → accepted (not rejected)', () => {
    const { handler, state, ctx } = makeService({ xcoord: 0.0, ycoord: 0.0 });
    const result = handler.command.handler(state, ['5', String(-UNIVMAX)], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.NAVFMT));
  });
});

// ---------------------------------------------------------------------------
// Navigating to the sector you are already in
// ---------------------------------------------------------------------------

describe('NavHandlerService — target inside the current sector', () => {
  it('returns a bearing rather than refusing', () => {
    // cmd_navigate (GECMDS.C:5109-5157) validates only the argument count and
    // the univmax bounds; it has no "already there" branch and happily returns
    // a bearing to a point inside your own sector.
    //
    // The refusal this replaces was the worst onboarding cliff in the game.
    // Every player spawns at a random point in sector (0,0) and must reach
    // Zygor-3 at its centre to buy anything at all, and `nav 0 0` is the
    // obvious way to ask which way that is. Answering "Already at target
    // sector." left a newcomer with no way to find the one planet the entire
    // opening depends on.
    const { handler, state, ctx } = makeService({
      xcoord: 7.4, ycoord: 3.9,
      holdcourse: 0, navTargetX: null, navTargetY: null,
    });
    const result = handler.command.handler(state, ['7', '3'], ctx) as { lines: { text: string }[] };
    expect(result.lines.some((l) => /bearing/i.test(l.text))).toBe(true);
  });

  it('floor(xcoord) === x but floor(ycoord) !== y → NOT already there', () => {
    const { handler, state, ctx } = makeService({ xcoord: 7.4, ycoord: 3.9 });
    const result = handler.command.handler(state, ['7', '4'], ctx) as { lines: { text: string }[] };
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.NAV_ALREADY_THERE));
  });
});

// ---------------------------------------------------------------------------
// Engagement happy path
// ---------------------------------------------------------------------------

describe('NavHandlerService — engagement happy path', () => {

  it('writes NOTHING to the ship — it is a read-only report', () => {
    // cmd_navigate computes and prints. It touches no field, which is why
    // asking for a bearing can no longer undock you, cancel a turn, or leave a
    // course behind for the tick to fly. @see GECMDS.C:5109-5156
    const { handler, state, ctx } = makeService({ xcoord: 5.0, ycoord: 5.0, dirty: false });
    const snap = (o: object) =>
      JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const before = snap(state);
    handler.command.handler(state, ['10', '8'], ctx);
    expect(snap(state)).toBe(before);
  });

  it('emits NAV01 message on success', () => {
    const { handler, state, ctx } = makeService({ xcoord: 5.0, ycoord: 5.0 });
    const result = handler.command.handler(state, ['10', '8'], ctx) as { lines: { text: string }[] };
    // Canon's NAV01 verbatim: "Sector %d %d is bearing %d, distance %s."
    // It sets no course and does not mention speed.
    expect(result.lines[0].text).toMatch(/^Sector 10 8 is bearing -?\d+, distance \d+\.$/);
    expect(result.lines[0].text).toContain('10');
    expect(result.lines[0].text).toContain('8');
  });

});

// ---------------------------------------------------------------------------
// Orbit is NOT broken by a navigation query
// ---------------------------------------------------------------------------

describe('NavHandlerService — nav never breaks orbit', () => {
  /**
   * C's cmd_navigate (GECMDS.C:5109-5155) is entirely argument validation,
   * cdistance, cbearing and prfmsg(NAV01). It never writes warsptr->where and
   * never touches repair. Breaking orbit is what the ENGINE commands do
   * (GECMDS.C:511-516 imp, :617-622 war), and this port does it there too.
   *
   * The port used to undock as a side effect of `nav`, so a pilot parked at the
   * Zygor-3 shop who merely asked which way (0,0) lay was thrown out of orbit
   * and had to fly a 439-unit round trip on impulse to finish trading. The
   * autopilot course itself is a documented deviation (docs/DECISIONS.md,
   * feature 016 D1) and stays; the undocking does not.
   */
  it('in orbit (where >= 10) → orbit and repair progress are preserved', () => {
    const { handler, state, ctx } = makeService({
      where: 13, repair: 42, xcoord: 5.0, ycoord: 5.0,
    });
    handler.command.handler(state, ['10', '8'], ctx);
    expect(state.where).toBe(13);
    expect(state.repair).toBe(42);
  });

  it('in orbit → no LEAVEORB line is emitted', () => {
    const { handler, state, ctx } = makeService({ where: 13 });
    const res = handler.command.handler(state, ['10', '8'], ctx) as {
      lines: { text: string }[];
    };
    const leaveorb = formatMessage(MessageId.LEAVEORB);
    expect(res.lines.some((l) => l.text === leaveorb)).toBe(false);
  });

  it('where === 10 → still in orbit afterwards', () => {
    const { handler, state, ctx } = makeService({ where: 10 });
    handler.command.handler(state, ['10', '8'], ctx);
    expect(state.where).toBe(10);
  });

  it('where < 10 → where unchanged', () => {
    const { handler, state, ctx } = makeService({ where: 0 });
    handler.command.handler(state, ['10', '8'], ctx);
    expect(state.where).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The bearing is heading-relative — say so, or it looks like a random number
// ---------------------------------------------------------------------------

describe('NavHandlerService — explains the shrinking bearing', () => {
  /**
   * NAV01 prints cbearing(from, to, heading) — a bearing RELATIVE to the hull's
   * present heading (GECMDS.C:5142-5155). Our physics tick steers head2b onto
   * course every tick, so an identical `nav 0 0` from a standing start reported
   * bearing 131 and then, seconds later with no rotate issued, bearing 0. The
   * arithmetic was right both times; nothing told the pilot why.
   */


});

// ---------------------------------------------------------------------------
// Keyword and aliases
// ---------------------------------------------------------------------------

describe('NavHandlerService — command metadata', () => {
  it('keyword is nav', () => {
    const { handler } = makeService();
    expect(handler.command.keyword).toBe('nav');
  });

  it('minArgs is 0 (status form allowed)', () => {
    const { handler } = makeService();
    expect(handler.command.minArgs).toBe(0);
  });
});

/**
 * `nav` prints a bearing RELATIVE to the ship's own heading, signed -180..180,
 * exactly as the original does: GECMDS.C:5142 passes `warsptr->heading` into
 * cbearing, and GELIB.C:142-166 folds the result about 180.
 *
 * Two separate defects lived here. The handler first used `atan2(dx, dy)` where
 * the physics tick uses `atan2(dx, -dy)`, mirroring the number about the
 * east-west axis. That was fixed, but the replacement returned an ABSOLUTE
 * compass bearing -- it never subtracted the heading at all -- which is a
 * different formula from the original's and produces a number no command will
 * accept: `pha` and `rot` are gated on valdegree's -180..180 (GEFUNCS.C:1941),
 * so any target off the port bow printed something like 300 and was then
 * refused, with nothing on screen suggesting you subtract 360.
 *
 * The invariant asserted below holds at ANY heading: converting the reported
 * relative bearing back to absolute must give the heading the autopilot steers.
 * The previous test compared the two directly, which only ever worked because
 * the fixture sat at heading 0 -- the same blind spot that hid the original bug.
 */
describe('NavHandlerService — reported bearing is relative to the ship heading', () => {
  /** Same expression the physics tick and engine-course use to point the ship. */
  const steeringBearing = (fromX: number, fromY: number, toX: number, toY: number): number =>
    Math.round(((Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI + 360) % 360);

  /** Accepts the sign: a bearing to port is negative. */
  const reported = (text: string): number => Number(/bearing (-?\d+)/.exec(text)?.[1] ?? NaN);

  const cases: Array<[string, number, number, number, number]> = [
    ['due north', 5, 9, 5, 2],
    ['due south', 5, 2, 5, 9],
    ['due east', 2, 5, 9, 5],
    ['due west', 9, 5, 2, 5],
    ['north-east', 2, 9, 8, 3],
  ];

  describe.each([0, 45, 90, 180, 270])('at heading %s', (heading) => {
    it.each(cases)('reports a steerable relative bearing for a target %s', (_l, sx, sy, tx, ty) => {
      const { handler, state, ctx } = makeService({
        xcoord: sx + 0.5, ycoord: sy + 0.5, heading,
      });
      const result = handler.command.handler(state, [String(tx), String(ty)], ctx) as {
        lines: Array<{ text: string }>;
      };
      const bearing = reported(result.lines[0].text);

      // Always a number a player can hand straight back to rot/pha.
      expect(Number.isNaN(bearing)).toBe(false);
      expect(bearing).toBeGreaterThanOrEqual(-180);
      expect(bearing).toBeLessThanOrEqual(180);

      // And it still points at the target: relative + own heading = absolute.
      const absolute = ((bearing + heading) % 360 + 360) % 360;
      const expected = steeringBearing(sx + 0.5, sy + 0.5, tx + 0.5, ty + 0.5);
      expect(Math.abs(absolute - expected)).toBeLessThanOrEqual(1);
    });
  });

  it('reports a negative bearing for a target off the port bow', () => {
    // The case that was unshootable: heading 0, target due west. The port
    // printed 270, which pha and rot both reject.
    const { handler, state, ctx } = makeService({ xcoord: 9.5, ycoord: 5.5, heading: 0 });
    const result = handler.command.handler(state, ['2', '5'], ctx) as {
      lines: Array<{ text: string }>;
    };
    expect(reported(result.lines[0].text)).toBe(-90);
  });
});
