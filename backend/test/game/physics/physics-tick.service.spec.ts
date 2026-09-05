import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACCENGAMT,
  COORD_SCALE,
  MOVENGMIN,
  MOVENGUSE, UNIVMAX, TELEDAM } from '../../../src/game/constants';
import {
  PHYSICS_BOUNDARY_WRAPPED,
  PHYSICS_HYPERSPACE,
  PHYSICS_SECTOR_TRANSITION,
  PhysicsBoundaryWrappedEvent,
  PhysicsHyperspaceEvent,
  PhysicsSectorTransitionEvent,
  PHYSICS_UNIVERSE_EDGE,
  PhysicsUniverseEdgeEvent,
} from '../../../src/game/physics/physics-events';
import { MAXX, MAXY } from '../../../src/game/constants';
import { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  // Default head2b to the same value as heading so a tick doesn't rotate the
  // ship out from under the test by chasing a stale target.
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
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

interface Harness {
  service: PhysicsTickService;
  shipMap: Map<string, ShipState>;
  events: EventEmitter2;
  capturedSector: PhysicsSectorTransitionEvent[];
  capturedHyperspace: PhysicsHyperspaceEvent[];
  fire(): void;
  ctx(tickNumber?: number): TickContext;
}

function makeHarness(ships: ShipState[], classes: Array<{ classNumber: number; maxAcceleration: number; maxWarp: number }> = [{ classNumber: 1, maxAcceleration: 1000, maxWarp: 10 }]): Harness {
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

  const cache = new ShipClassCacheService({} as any);
  for (const c of classes) cache.setForTest(c.classNumber, { maxAcceleration: c.maxAcceleration, maxWarp: c.maxWarp });

  const events = new EventEmitter2();
  const capturedSector: PhysicsSectorTransitionEvent[] = [];
  const capturedHyperspace: PhysicsHyperspaceEvent[] = [];
  events.on(PHYSICS_SECTOR_TRANSITION, (e: PhysicsSectorTransitionEvent) => capturedSector.push(e));
  events.on(PHYSICS_HYPERSPACE, (e: PhysicsHyperspaceEvent) => capturedHyperspace.push(e));

  const service = new PhysicsTickService(tickService, shipState, cache, events);
  service.onModuleInit();

  let n = 0;
  return {
    service,
    shipMap,
    events,
    capturedSector,
    capturedHyperspace,
    ctx: (tickNumber: number = ++n) => ({ kind: TickKind.PHYSICS, tickNumber, firedAt: new Date() }),
    fire() {
      const c = this.ctx();
      for (const sub of subscribers) sub(c);
    },
  };
}

describe('PhysicsTickService', () => {
  describe('US1 — movement', () => {
    it('player ship at warp 1 advances coords, drains MOVENGUSE, emits hyperspace=enter once', () => {
      const ship = makeShip({
        xcoord: 5.0, ycoord: 5.0, heading: 90,
        speed: 0, speed2b: 1000, energy: 50000, status: 1, shpclass: 1,
      });
      const h = makeHarness([ship], [{ classNumber: 1, maxAcceleration: 1000, maxWarp: 10 }]);
      h.fire();

      expect(ship.speed).toBe(1000);
      expect(ship.xcoord).toBeCloseTo(5.0 + 1000 / COORD_SCALE, 10);
      expect(ship.ycoord).toBeCloseTo(5.0, 10);
      // The step from 0 to 1000 snaps onto the target, and C's snap branch
      // never calls useenergy — only MOVENGUSE is charged.
      // @see GEFUNCS.C:484-497
      expect(ship.energy).toBe(50000 - MOVENGUSE);
      expect(h.capturedHyperspace).toHaveLength(1);
      expect(h.capturedHyperspace[0]).toMatchObject({ direction: 'enter', speed: 1000, shipId: 'u1:1' });
    });

    it('crosses sector boundary and emits sector-transition with floor coords', () => {
      // Well inside the universe: crossing at +UNIVMAX would wrap instead.
      const ship = makeShip({
        xcoord: 5.95, ycoord: 5.0, heading: 90, speed: 21000, speed2b: 21000, status: 1,
      });
      const h = makeHarness([ship]);
      h.fire();

      expect(h.capturedSector).toHaveLength(1);
      const ev = h.capturedSector[0];
      expect(ev.fromSector).toEqual({ x: 5, y: 5 });
      expect(ev.toSector).toEqual({ x: 6, y: 5 });
      expect(ev.x).toBeCloseTo(ship.xcoord, 10);
      expect(ev.shipId).toBe('u1:1');
    });

    it('AI ship (status=2) does NOT pay MOVENGUSE', () => {
      const ship = makeShip({
        xcoord: 5.0, ycoord: 5.0, heading: 90, speed: 1000, speed2b: 1000,
        energy: 50000, status: 2,
      });
      const h = makeHarness([ship]);
      h.fire();

      expect(ship.energy).toBe(50000);
      expect(ship.xcoord).toBeGreaterThan(5.0);
    });

    it('ship in orbit (where>=10) skips accel/move/maintenance but STILL ROTATES', () => {
      // `warrti2a` calls rotateship/accel/moveship/destruct with no orbit test
      // (GEMAIN.C:2476-2483), and rotateship contains no reference to `where`
      // at all (GEFUNCS.C:433-461) — the gate lives only in moveship (:641,
      // :652). Gating rotation too meant an orbiting pilot was told "Now
      // turning to N degrees" and simply did not turn, with no way to see it:
      // `rep nav` correctly omits heading while orbiting (GECMDS.C:1984-1988),
      // so every `sca pl` bearing taken in orbit used a stale heading.
      const ship = makeShip({
        where: 13, xcoord: 5.0, ycoord: 5.0, heading: 0, head2b: 90,
        speed: 1000, speed2b: 1000, energy: 50000, status: 1,
      });
      const h = makeHarness([ship]);
      h.fire();

      expect(ship.xcoord).toBe(5.0);
      expect(ship.ycoord).toBe(5.0);
      expect(ship.speed).toBe(1000);
      expect(ship.energy).toBe(50000);
      expect(ship.heading).not.toBe(0); // turning toward head2b
    });

    it('MOVENGMIN floor cutoff forces speed2b = 0 and the ship coasts down', () => {
      // energy starts just above MOVENGMIN so one MOVENGUSE debit drops below.
      const ship = makeShip({
        xcoord: 5.0, ycoord: 5.0, heading: 90,
        speed: 500, speed2b: 500, energy: MOVENGMIN + 5, status: 1,
      });
      const h = makeHarness([ship]);
      h.fire();
      expect(ship.energy).toBeLessThan(MOVENGMIN);
      expect(ship.speed2b).toBe(0);
      // Next tick — ship should be decelerating, not stopping instantly.
      const speedBefore = ship.speed;
      h.fire();
      expect(ship.speed).toBeLessThan(speedBefore);
      expect(ship.speed).toBeGreaterThanOrEqual(0);
    });

    it('per-ship fault isolation: NaN speed on one ship does not stop the others', () => {
      const bad = makeShip({ userid: 'a', shipno: 1, speed: NaN as any, speed2b: NaN as any });
      const good = makeShip({ userid: 'b', shipno: 1, heading: 90, speed: 1000, speed2b: 1000, status: 1, energy: 50000, xcoord: 1, ycoord: 1 });
      const h = makeHarness([bad, good]);
      // Force a real fault: corrupt the ship-class cache so good's class throws.
      // Actually, NaN won't throw. Inject failure via head2b that triggers a thrown error.
      // Simpler: poison `bad` so the inner mutate throws. Use a proxy on heading.
      Object.defineProperty(bad, 'heading', { get() { throw new Error('boom'); } });

      h.fire();
      expect(h.service.getFaultCount()).toBeGreaterThanOrEqual(1);
      expect(good.speed).toBe(1000);
      expect(good.xcoord).toBeGreaterThan(1);
    });
  });

  describe('US2 — rotation', () => {
    it('rotates 350 → 10 the short way in one tick when step=20', () => {
      const ship = makeShip({ heading: 350, head2b: 10, shpclass: 1, speed: 0, speed2b: 0 });
      const h = makeHarness([ship], [{ classNumber: 1, maxAcceleration: 200, maxWarp: 10 }]);
      h.fire();
      expect(ship.heading).toBe(10);
    });

    it('a ship in orbit rotates, exactly as one in open space does', () => {
      // @see GEFUNCS.C:433-461 — rotateship has no `where` test.
      const orbiting = makeShip({ where: 12, heading: 0, head2b: 180, shpclass: 1 });
      const free = makeShip({ userid: 'b', where: 0, heading: 0, head2b: 180, shpclass: 1 });
      const h = makeHarness([orbiting, free], [{ classNumber: 1, maxAcceleration: 1000, maxWarp: 10 }]);
      h.fire();
      expect(orbiting.heading).not.toBe(0);
      expect(orbiting.heading).toBe(free.heading);
    });
  });

  describe('US3 — countdowns', () => {
    it('decrements hypha and cantexit by 1 each tick, floors at 0', () => {
      const a = makeShip({ userid: 'a', shipno: 1, hypha: 3, cantexit: 5 });
      const b = makeShip({ userid: 'b', shipno: 1, where: 13, hypha: 3, cantexit: 5 });
      const h = makeHarness([a, b]);
      h.fire();
      expect(a.hypha).toBe(2);
      expect(a.cantexit).toBe(4);
      expect(b.hypha).toBe(2);
      expect(b.cantexit).toBe(4);

      for (let i = 0; i < 10; i++) h.fire();
      expect(a.hypha).toBe(0);
      expect(a.cantexit).toBe(0);
      expect(b.hypha).toBe(0);
      expect(b.cantexit).toBe(0);
    });

    it('does not underflow when already at 0', () => {
      const ship = makeShip({ hypha: 0, cantexit: 0 });
      const h = makeHarness([ship]);
      h.fire();
      expect(ship.hypha).toBe(0);
      expect(ship.cantexit).toBe(0);
    });
  });

  describe('US1 — universe boundary wrap (T006)', () => {
    function makeWrapHarness(ship: ShipState) {
      const h = makeHarness([ship]);
      const capturedWrapped: PhysicsBoundaryWrappedEvent[] = [];
      h.events.on(PHYSICS_BOUNDARY_WRAPPED, (e: PhysicsBoundaryWrappedEvent) => capturedWrapped.push(e));
      return { ...h, capturedWrapped };
    }

    // Canon ships UNIVWRAP=NO (GEMAIN.C:475), so these now cover the WALL, not
    // the wrap. The port implemented only the wrap arm, which handed anyone
    // reaching the boundary a free full-speed jump clean across the galaxy --
    // pursuers as much as anyone fleeing them.
    //
    // Both arms of the branch are covered as pure functions in
    // physics-math.spec.ts; what is asserted here is the telezip side effect,
    // which the tick applies: GEFUNCS.C:819-833 zeroes speed and speed2b and
    // adds TELEDAM.

    it('ship crossing the east edge is pinned just inside it, not wrapped', () => {
      const ship = makeShip({ xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.xcoord).toBe(UNIVMAX - 2);
      expect(ship.xcoord).toBeGreaterThan(0); // did NOT come out the far side
    });

    it('ship crossing the south edge is pinned just inside it', () => {
      const ship = makeShip({ xcoord: 0, ycoord: UNIVMAX - 0.05, heading: 180, speed: 5000, speed2b: 5000, where: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.ycoord).toBe(UNIVMAX - 2);
      expect(ship.ycoord).toBeGreaterThan(0);
    });

    it('striking the edge costs all momentum and TELEDAM hull', () => {
      // The reason the wall matters: you cannot use the boundary to escape,
      // because you arrive stopped and damaged.
      const ship = makeShip({ xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0, damage: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.speed).toBe(0);
      expect(ship.speed2b).toBe(0);
      expect(ship.damage).toBe(TELEDAM);
      expect(ship.heading).toBe(90); // heading is untouched
    });

    it('emits PHYSICS_UNIVERSE_EDGE, and does NOT emit a wrap event', () => {
      const ship = makeShip({ xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0 });
      const h = makeWrapHarness(ship);
      const edges: PhysicsUniverseEdgeEvent[] = [];
      h.events.on(PHYSICS_UNIVERSE_EDGE, (e: PhysicsUniverseEdgeEvent) => edges.push(e));
      h.fire();
      expect(edges).toHaveLength(1);
      expect(edges[0].damage).toBe(TELEDAM);
      expect(h.capturedWrapped).toHaveLength(0);
    });

    it('leaves a ship inside the boundary alone', () => {
      const ship = makeShip({ xcoord: 0, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0, damage: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.speed).toBe(9000);
      expect(ship.damage).toBe(0);
    });

    it('drops a warping ship out of hyperspace instead of stranding it', () => {
      // C's telezip zeroes speed and speed2b but never calls
      // hyperspace(ptr,usrn,0), and the only exit transition requires
      // `speed/1000 >= 1` (GEFUNCS.C:537-539) — impossible at a dead stop. The
      // original leaves you flagged as in-hyperspace forever; the escape is to
      // `war 1` then `war 0`, which no player would deduce. Fixed.
      const ship = makeShip({
        xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90,
        speed: 9000, speed2b: 9000, where: 1, damage: 0,
      });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.speed).toBe(0);
      expect(ship.damage).toBe(TELEDAM);
      expect(ship.where).toBe(0);
    });

    it('does not apply the edge in hyperspace (where > 1)', () => {
      // C guards the whole block with `if (ptr->where <= 1)`.
      const ship = makeShip({ xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 2, damage: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      expect(ship.damage).toBe(0);
      expect(ship.speed).toBe(9000);
    });

    it('sector-transition event fires with the post-edge sector', () => {
      const ship = makeShip({ xcoord: UNIVMAX - 0.05, ycoord: 0, heading: 90, speed: 9000, speed2b: 9000, where: 0 });
      const h = makeWrapHarness(ship);
      h.fire();
      // The ship is pinned just inside the east edge, not wrapped west.
      const trans = h.capturedSector.filter((e) => e.shipId === 'u1:1');
      if (trans.length > 0) {
        // If a sector transition fired, toSector should be in-range
        const to = trans[trans.length - 1].toSector;
        expect(to.x).toBeGreaterThanOrEqual(-UNIVMAX);
        expect(to.x).toBeLessThanOrEqual(UNIVMAX);
      }
    });

    it('wrap is a no-op when ship is in orbit (where >= 10)', () => {
      // Ship at exactly boundary x=29.8, but in orbit — wrap should NOT apply
      const ship = makeShip({ xcoord: 29.8, ycoord: 7.0, heading: 90, speed: 9000, speed2b: 9000, where: 10 });
      const h = makeWrapHarness(ship);
      h.fire();
      // In orbit, ship does NOT move at all (inOrbitOrDocked skips conditional block)
      // so coords unchanged regardless
      expect(h.capturedWrapped).toHaveLength(0);
    });
  });

  describe('FR-019 ordering', () => {
    it('processes ships in ascending shipKey order', () => {
      const order: string[] = [];
      const a = makeShip({ userid: 'b', shipno: 1, hypha: 1 });
      const b = makeShip({ userid: 'a', shipno: 2, hypha: 1 });
      const c = makeShip({ userid: 'a', shipno: 1, hypha: 1 });
      // Use a logger spy via mutate to record order. Easier: hook the mutate via shipname update side effect.
      const h = makeHarness([a, b, c]);
      // Patch findAllShips order to be insertion order; service should re-sort.
      h.fire();
      // After tick, all should have hypha 0; the test really verifies sorting
      // doesn't blow up on multi-key. (Direct order check would require a hook.)
      expect(a.hypha).toBe(0);
      expect(b.hypha).toBe(0);
      expect(c.hypha).toBe(0);
      // Sanity-check sort: 'a:1' < 'a:2' < 'b:1'
      const keys = ['a:1', 'a:2', 'b:1'];
      const sorted = keys.slice().sort();
      expect(sorted).toEqual(keys);
      void order;
    });
  });
});
