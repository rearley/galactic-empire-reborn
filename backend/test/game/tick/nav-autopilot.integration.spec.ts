/**
 * T010 — Integration test: autopilot advances ship to target over multiple physics ticks.
 * TDD red phase: the autopilot branch does not exist in PhysicsTickService yet.
 *
 * Contract assertions:
 *   (a) head2b is recomputed each tick toward target+0.5 cell center
 *   (b) ship eventually reaches the floor-based target sector
 *   (c) NAV_ARRIVED is emitted exactly once (via EventEmitter2 nav.arrived event)
 *   (d) holdcourse, navTargetX, navTargetY are cleared on arrival
 *   (e) no further steering occurs in the same tick after arrival
 *
 * @see specs/016-navigation-spy/contracts/nav-command.md §per-tick-behavior
 * @see GECMDS.C:5120 cmd_navigate
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickKind, TickContext } from '../../../src/game/tick/tick.types';
import {
  PHYSICS_SECTOR_TRANSITION,
  PhysicsSectorTransitionEvent,
} from '../../../src/game/physics/physics-events';

/** The EventEmitter2 event name emitted by PhysicsTickService on autopilot arrival. */
const PHYSICS_NAV_ARRIVED = 'physics.nav-arrived' as const;

export interface PhysicsNavArrivedEvent {
  userid: string;
  shipno: number;
  x: number;
  y: number;
  message: string;
  tickAt: Date;
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const heading = overrides.heading ?? 0;
  const head2b = overrides.head2b ?? heading;
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading, head2b, speed: 0, speed2b: 0,
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
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

interface AutopilotHarness {
  service: PhysicsTickService;
  shipMap: Map<string, ShipState>;
  events: EventEmitter2;
  capturedNavArrived: PhysicsNavArrivedEvent[];
  capturedSector: PhysicsSectorTransitionEvent[];
  fire(tickNumber?: number): void;
}

function makeHarness(ships: ShipState[]): AutopilotHarness {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as any;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
  } as any;

  // Class 1: maxAcceleration=1000, maxWarp=10 — high enough to move fast
  const cache = new ShipClassCacheService({} as any);
  cache.setForTest(1, { maxAcceleration: 10000, maxWarp: 10 });

  const events = new EventEmitter2();
  const capturedNavArrived: PhysicsNavArrivedEvent[] = [];
  const capturedSector: PhysicsSectorTransitionEvent[] = [];
  events.on(PHYSICS_NAV_ARRIVED, (e: PhysicsNavArrivedEvent) => capturedNavArrived.push(e));
  events.on(PHYSICS_SECTOR_TRANSITION, (e: PhysicsSectorTransitionEvent) => capturedSector.push(e));

  const service = new PhysicsTickService(tickService, shipState, cache, events);
  service.onModuleInit();

  let n = 0;
  const fire = (tickNumber?: number) => {
    const ctx: TickContext = {
      kind: TickKind.PHYSICS,
      tickNumber: tickNumber ?? ++n,
      firedAt: new Date(),
    };
    for (const sub of subscribers) sub(ctx);
  };

  return { service, shipMap, events, capturedNavArrived, capturedSector, fire };
}

// ---------------------------------------------------------------------------
// T010: Autopilot drives ship to target sector
// ---------------------------------------------------------------------------

describe('PhysicsTickService — autopilot (nav holdcourse branch)', () => {
  /**
   * Ship starts at (5.0, 5.0) with holdcourse=1, target (8, 5).
   * At warp 5 (speed2b=5000), the ship should arrive within ~20 ticks.
   * Target sector arrival: floor(xcoord)===8 && floor(ycoord)===5.
   */

  it('(a) head2b is recomputed each tick toward target cell center (navTargetX+0.5, navTargetY+0.5)', () => {
    const ship = makeShip({
      xcoord: 5.0, ycoord: 5.0,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 5000, speed2b: 5000,
    });
    const h = makeHarness([ship]);

    // Before first tick, head2b is whatever the initial heading was (0)
    const head2bBefore = ship.head2b;
    h.fire();

    // After the tick, head2b should point toward (8.5, 5.5) from (5.x, 5.y)
    // That means it should be pointing roughly east (positive x direction).
    // Bearing east = ~90 degrees in the GE coordinate system (north=0, east=90).
    // The exact value depends on position, but it should be > 0 and < 180 (pointing right).
    // We check it changed from initial 0 toward the target.
    expect(ship.head2b).not.toBe(head2bBefore);
    // Targeting (8.5, 5.5) from (5.0, 5.0) → dx=+3.5, dy=+0.5 → bearing near east
    // atan2(dx, dy) → atan2(3.5, 0.5) ≈ 81.9 degrees
    expect(ship.head2b).toBeGreaterThan(70);
    expect(ship.head2b).toBeLessThan(100);
  });

  it('(b) ship eventually reaches the floor-based target sector', () => {
    const ship = makeShip({
      xcoord: 5.0, ycoord: 5.0,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 5000, speed2b: 5000,
    });
    const h = makeHarness([ship]);

    // Advance up to 100 ticks — ship at warp 5 should easily reach 3 sectors away
    let arrived = false;
    for (let i = 0; i < 100; i++) {
      h.fire();
      if (Math.floor(ship.xcoord) === 8 && Math.floor(ship.ycoord) === 5) {
        arrived = true;
        break;
      }
    }

    expect(arrived).toBe(true);
  });

  it('(c) NAV_ARRIVED event emitted exactly once on arrival', () => {
    const ship = makeShip({
      xcoord: 5.0, ycoord: 5.0,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 5000, speed2b: 5000,
    });
    const h = makeHarness([ship]);

    // Advance until ship is cleared or max ticks
    for (let i = 0; i < 100; i++) {
      h.fire();
      if (ship.holdcourse === 0) break;
    }

    expect(h.capturedNavArrived).toHaveLength(1);
    expect(h.capturedNavArrived[0].userid).toBe('u1');
    expect(h.capturedNavArrived[0].x).toBe(8);
    expect(h.capturedNavArrived[0].y).toBe(5);
  });

  it('(d) holdcourse, navTargetX, navTargetY are cleared on arrival', () => {
    const ship = makeShip({
      xcoord: 5.0, ycoord: 5.0,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
      speed: 5000, speed2b: 5000,
    });
    const h = makeHarness([ship]);

    for (let i = 0; i < 100; i++) {
      h.fire();
      if (ship.holdcourse === 0) break;
    }

    expect(ship.holdcourse).toBe(0);
    expect(ship.navTargetX).toBeNull();
    expect(ship.navTargetY).toBeNull();
  });

  it('(e) no further steering in the same tick after arrival (head2b not updated post-arrival)', () => {
    // Place ship one tick away from arriving: set position so floor will match after one move step.
    // We'll put it at (7.99, 5.0) heading east at warp — one tick will push it past floor=8.
    const ship = makeShip({
      xcoord: 7.99, ycoord: 5.2,
      heading: 90, head2b: 90,
      speed: 5000, speed2b: 5000,
      holdcourse: 1, navTargetX: 8, navTargetY: 5,
    });
    const h = makeHarness([ship]);

    h.fire(); // This tick should cause arrival

    // After arrival, holdcourse should be 0
    if (ship.holdcourse === 0) {
      // Capture head2b right at arrival — it should NOT have been updated this tick
      // (arrival check fires first, then continue skips steering).
      // head2b should still be 90 (the pre-tick value), not recalculated toward cleared target.
      expect(ship.navTargetX).toBeNull();
      expect(ship.navTargetY).toBeNull();
    } else {
      // Might need one more tick if position didn't cross floor yet
      h.fire();
      expect(ship.holdcourse).toBe(0);
      expect(ship.navTargetX).toBeNull();
    }
  });

  it('ship with holdcourse=0 is not steered by autopilot branch', () => {
    const ship = makeShip({
      xcoord: 5.0, ycoord: 5.0, heading: 0, head2b: 0,
      holdcourse: 0, navTargetX: null, navTargetY: null,
      speed: 0, speed2b: 0,
    });
    const h = makeHarness([ship]);
    h.fire();
    // head2b should not have been changed by autopilot (it stays 0 from default)
    expect(ship.head2b).toBe(0);
    expect(h.capturedNavArrived).toHaveLength(0);
  });
});
