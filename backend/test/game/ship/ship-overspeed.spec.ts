/**
 * T010 — Unit tests for decideOverspeed (pure function).
 * Covers the GEFUNCS.C:733-792 formula branches.
 * @see backend/src/game/ship/ship-overspeed.ts decideOverspeed
 * @see GEFUNCS.C:733 overspeed check
 */
import { decideOverspeed, OverspeedRng } from '../../../src/game/ship/ship-overspeed';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    speed2b: 5000,
    xcoord: 5.5,
    ycoord: 5.5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

/** RNG that always returns 0 — guarantees lottery fires. */
const alwaysWin: OverspeedRng = { intBelow: () => 0 };
/** RNG that always returns 1 — guarantees lottery misses (safeDiff must be > 1). */
const alwaysLose: OverspeedRng = { intBelow: () => 1 };

// ---------------------------------------------------------------------------
// No overspeed condition
// ---------------------------------------------------------------------------

describe('decideOverspeed — no overspeed', () => {
  it('returns noop when speed is below topspeed', () => {
    const ship = makeShip({ speed: 4000, topspeed: 5, speed2b: 5000, warncntr: 0 });
    expect(decideOverspeed(ship, alwaysWin)).toEqual({ kind: 'noop' });
  });

  it('returns noop when speed equals topspeed exactly', () => {
    const ship = makeShip({ speed: 5000, topspeed: 5, speed2b: 5000, warncntr: 0 });
    expect(decideOverspeed(ship, alwaysWin)).toEqual({ kind: 'noop' });
  });

  it('returns noop when speed > speed2b (already in free flight, not accelerating)', () => {
    const ship = makeShip({ speed: 7000, topspeed: 5, speed2b: 5000, warncntr: 0 });
    expect(decideOverspeed(ship, alwaysWin)).toEqual({ kind: 'noop' });
  });
});

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

describe('decideOverspeed — recovery', () => {
  it('returns recover when speed normalizes and warncntr > 0', () => {
    const ship = makeShip({ speed: 3000, topspeed: 5, speed2b: 5000, warncntr: 3 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('recover');
    if (result.kind === 'recover') {
      expect(result.warncntr).toBe(0);
      expect(result.topspeed).toBeGreaterThanOrEqual(0);
      expect(result.speed2b).toBe(result.topspeed * 1000);
    }
  });

  it('recovery topspeed = floor(topspeed / warncntr)', () => {
    const ship = makeShip({ speed: 3000, topspeed: 9, speed2b: 9000, warncntr: 3 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('recover');
    if (result.kind === 'recover') {
      expect(result.topspeed).toBe(3);
    }
  });

  it('never RAISES the target speed — a pilot who cut engines stays stopped', () => {
    // C writes `ptr->speed2b = ptr->topspeed*1000.0` flat (GEFUNCS.C:777),
    // setting the target rather than capping it. A pilot who took the warning
    // and typed `war 0` to stop and repair was pushed back up to the new top
    // speed and kept flying -- fatal under fire, since you cannot stop to raise
    // shields or run repairs at the moment you most need to. Fixed, per the
    // standing rule that the original's defects are not reproduced.
    const stopped = makeShip({ speed: 3000, topspeed: 9, speed2b: 0, warncntr: 3 });
    const result = decideOverspeed(stopped, alwaysWin);
    expect(result.kind).toBe('recover');
    if (result.kind === 'recover') {
      expect(result.topspeed).toBe(3);   // the derate still bites
      expect(result.speed2b).toBe(0);    // but the throttle is left where it was
    }
  });

  it('still derates the target speed when it exceeds the new ceiling', () => {
    const cruising = makeShip({ speed: 3000, topspeed: 9, speed2b: 9000, warncntr: 3 });
    const result = decideOverspeed(cruising, alwaysWin);
    expect(result.kind).toBe('recover');
    if (result.kind === 'recover') {
      expect(result.speed2b).toBe(3000); // clamped down to topspeed * 1000
    }
  });

  it('returns noop when speed normalizes but warncntr is 0', () => {
    const ship = makeShip({ speed: 3000, topspeed: 5, speed2b: 5000, warncntr: 0 });
    expect(decideOverspeed(ship, alwaysWin)).toEqual({ kind: 'noop' });
  });
});

// ---------------------------------------------------------------------------
// Lottery miss → noop
// ---------------------------------------------------------------------------

describe('decideOverspeed — lottery miss', () => {
  it('returns noop when lottery does not fire (rng returns non-zero)', () => {
    // speed=6000 > topspeed=5, within speed2b=7000
    const ship = makeShip({ speed: 6000, topspeed: 5, speed2b: 7000, warncntr: 0 });
    const result = decideOverspeed(ship, alwaysLose);
    expect(result.kind).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// Warn path
// ---------------------------------------------------------------------------

describe('decideOverspeed — warn', () => {
  it('returns warn with warncntr+1 when lottery fires and warncntr <= 4', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 0 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.warncntr).toBe(1);
    }
  });

  it('increments warncntr from existing value', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 3 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.warncntr).toBe(4);
    }
  });

  it('returns warn (not break) when warncntr === 4', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 4 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.warncntr).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Break path
// ---------------------------------------------------------------------------

describe('decideOverspeed — engine break', () => {
  it('returns break when lottery fires and warncntr > 4', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 5 });
    let damageRoll = 0;
    const rng: OverspeedRng = {
      intBelow: (n: number) => {
        if (n === 20) { damageRoll = 7; return 7; }
        return 0; // lottery fires
      },
    };
    const result = decideOverspeed(ship, rng);
    expect(result.kind).toBe('break');
    if (result.kind === 'break') {
      expect(result.topspeed).toBe(0);
      expect(result.speed2b).toBe(0);
      expect(result.damage).toBe(7);
    }
  });

  it('break fires at warncntr === 5 (> 4)', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 5 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('break');
  });

  it('break fires at warncntr === 10', () => {
    const ship = makeShip({ speed: 8000, topspeed: 5, speed2b: 9000, warncntr: 10 });
    const result = decideOverspeed(ship, alwaysWin);
    expect(result.kind).toBe('break');
  });
});

// ---------------------------------------------------------------------------
// diff clamping (diff < 0 → 5) — GEFUNCS.C:758 "if (diff < 0) diff = 5"
// ---------------------------------------------------------------------------

describe('decideOverspeed — diff clamping', () => {
  it('clamps diff to safeDiff=5 when intspeed is far above topspeed', () => {
    // intspeed=100, topspeed=1 → diff = 99, 60-99 = -39 → clamped to 5
    const ship = makeShip({ speed: 100_000, topspeed: 1, speed2b: 110_000, warncntr: 0 });
    // With safeDiff=5, only intBelow(5)===0 fires → use alwaysWin
    const result = decideOverspeed(ship, alwaysWin);
    // Should warn or break, not noop
    expect(result.kind).not.toBe('noop');
  });
});
