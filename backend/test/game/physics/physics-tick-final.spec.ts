/**
 * The last uncovered decisions in `PhysicsTickService`: the UNIVWRAP arm of the
 * universe boundary, and the `physics.boundary-wrapped` event it produces.
 *
 * Every other conditional in that file is already pinned — the no-wrap
 * (telezip) arm by `physics-tick.service.spec.ts`, gravity by
 * `gravity-hyperspace-exempt.spec.ts` and the physics half of
 * `droid-lifecycle-and-physics.spec.ts`, the helm ladder by
 * `helm-narration.spec.ts`, the cadence by `movement-cadence.spec.ts` and
 * `stride-stability.spec.ts`. What no spec reaches is the OTHER arm of
 *
 *     xWrapped = UNIVWRAP && ex.value !== next.x;      (physics-tick 473-474)
 *     if (xWrapped || yWrapped) { axis = ... }         (physics-tick 533-534)
 *
 * because `UNIVWRAP` is read once from `GAME_CONFIG` at import time and canon
 * ships NO (`univwrap = ynopt(UNIVWRAP)`, GEMAIN.C:475), so in the normal build
 * the whole block is dead. It is not dead for a sysop who turns wrapping on,
 * which the port supports deliberately (docs/DECISIONS.md — UNIVWRAP
 * implemented, defaulting to canon NO), and it is the one arm a refactor of the
 * move loop could delete without any test noticing.
 *
 * So this file loads a SECOND copy of the module graph with `UNIVWRAP=1` in the
 * environment — the loader's documented default -> file -> env -> clamp chain
 * (game-config.ts) — and flies ships off the edge of that galaxy.
 *
 * Canon for the two arms, GEFUNCS.C:651-705 moveship — condensed here, as the
 * original repeats the same shape four times (x over, x under, y over, y under):
 *
 *     if (univwrap) {
 *         if (ptr->coord.xcoord >  univmax) ptr->coord.xcoord -= univmax*2;
 *         if (ptr->coord.xcoord < -univmax) ptr->coord.xcoord += univmax*2;
 *     } else {
 *         ptr->coord.xcoord = (double)(univmax-2);
 *         telezip(ptr,usrn);          // speed = 0, speed2b = 0, damage += TELEDAM
 *     }
 *
 * The asymmetry is the whole mechanic and is what these cases pin: wrapping
 * carries your momentum across intact, the wall takes it. Movement runs on the
 * 1-second SHIP_UPDATE tick, strided by 3 (GEMAIN.C:2462-2493); every ship here
 * holds channel 0, so it moves on the first tick and each case fires exactly
 * one.
 *
 * DELIBERATELY NOT COVERED, per docs/TEST_STRATEGY.md:
 *   - physics-tick 223, the equal arm of the sort comparator: composite ship
 *     keys are unique, so it is unreachable.
 *   - physics-tick 235, the `err instanceof Error ? stack : String(err)` log
 *     ternary — a display fallback inside the fault logger.
 *   - physics-tick 626, `event.isWormhole ? 'wormhole n' : 'planet n'` in the
 *     CRASH deathCause. `checkGravity` only ever pairs a `crash` effect with a
 *     body that is not a wormhole (gravity.ts — a wormhole gets the
 *     `wormhole` effect), so the wormhole arm of that label is unreachable.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PHYSICS_BOUNDARY_WRAPPED,
  PHYSICS_SECTOR_TRANSITION,
  PHYSICS_UNIVERSE_EDGE,
  type PhysicsBoundaryWrappedEvent,
  type PhysicsSectorTransitionEvent,
  type PhysicsUniverseEdgeEvent,
} from '../../../src/game/physics/physics-events';
import type { PhysicsTickService } from '../../../src/game/physics/physics-tick.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import { shipKey, type ShipState } from '../../../src/game/ship/ship-state.types';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { TickService } from '../../../src/game/tick/tick.service';
import { TickKind, type TickContext } from '../../../src/game/tick/tick.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

type PhysicsModule = typeof import('../../../src/game/physics/physics-tick.service');
type ConstantsModule = typeof import('../../../src/game/constants');

/** The wrapping build's `PhysicsTickService` class. */
let WrappingPhysicsTickService: PhysicsModule['PhysicsTickService'];
/** `UNIVMAX` as that build resolved it (the test galaxy is small — 20). */
let UNIVMAX = 0;
/** `UNIVWRAP` as that build resolved it — the harness's own precondition. */
let UNIVWRAP = false;
/** `TELEDAM`, so the "no telezip" assertions name the damage they exclude. */
let TELEDAM = 0;

beforeAll(() => {
  const previous = process.env.UNIVWRAP;
  process.env.UNIVWRAP = '1';
  try {
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const constants = require('../../../src/game/constants') as ConstantsModule;
      const physics = require('../../../src/game/physics/physics-tick.service') as PhysicsModule;
      /* eslint-enable @typescript-eslint/no-require-imports */
      UNIVMAX = constants.UNIVMAX;
      UNIVWRAP = constants.UNIVWRAP;
      TELEDAM = constants.TELEDAM;
      WrappingPhysicsTickService = physics.PhysicsTickService;
    });
  } finally {
    if (previous === undefined) delete process.env.UNIVWRAP;
    else process.env.UNIVWRAP = previous;
  }
});

/** Speed that moves a ship exactly 0.1 sectors per step: 6500 / COORD_SCALE. */
const STEP_SPEED = 6500;
/** How far inside the edge each ship starts — half a step, so one step crosses. */
const INSET = 0.05;

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const heading = overrides.heading ?? 0;
  return baseMakeShip({
    shipname: 'Wanderer',
    heading: heading,
    head2b: overrides.head2b ?? heading,
    speed: STEP_SPEED,
    speed2b: STEP_SPEED,
    energy: 50_000,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255],
    lmisslDistance: [0, 0, 0],
    lmisslEnergy: [0, 0, 0],
    topspeed: 10,
    // Canon's `zothusn`. Slot 0 moves on the first 1-second tick.
    channel: 0,
    ...overrides,
  });
}

interface Harness {
  service: PhysicsTickService;
  ship: ShipState;
  wrapped: PhysicsBoundaryWrappedEvent[];
  transitions: PhysicsSectorTransitionEvent[];
  edges: PhysicsUniverseEdgeEvent[];
  firedAt: Date;
  /** One 1-second SHIP_UPDATE tick — the only ship in the map moves on it. */
  second(): void;
}

function makeHarness(ship: ShipState): Harness {
  const ships = new Map<string, ShipState>([[shipKey(ship.userid, ship.shipno), ship]]);

  const shipState = {
    findAllShips: () => Array.from(ships.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;

  const subscribers: Array<{ kind: TickKind; fn: (c: TickContext) => void }> = [];
  const tickService = {
    subscribe: (kind: TickKind, fn: (c: TickContext) => void) => {
      subscribers.push({ kind, fn });
      return () => {};
    },
  } as unknown as TickService;

  // The REAL cache, seeded through its test seam: `isHydrated()` reports true
  // because the map is non-empty, which is what the boot-race guard reads.
  const cache = new ShipClassCacheService({} as unknown as PrismaService);
  cache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10 });

  const events = new EventEmitter2();
  const wrapped: PhysicsBoundaryWrappedEvent[] = [];
  const transitions: PhysicsSectorTransitionEvent[] = [];
  const edges: PhysicsUniverseEdgeEvent[] = [];
  events.on(PHYSICS_BOUNDARY_WRAPPED, (e: PhysicsBoundaryWrappedEvent) => wrapped.push(e));
  events.on(PHYSICS_SECTOR_TRANSITION, (e: PhysicsSectorTransitionEvent) => transitions.push(e));
  events.on(PHYSICS_UNIVERSE_EDGE, (e: PhysicsUniverseEdgeEvent) => edges.push(e));

  const service = new WrappingPhysicsTickService(tickService, shipState, cache, events);
  service.onModuleInit();

  const firedAt = new Date('2026-09-10T12:00:00.000Z');
  const second = (): void => {
    const ctx: TickContext = { kind: TickKind.SHIP_UPDATE, tickNumber: 1, firedAt };
    for (const sub of subscribers) if (sub.kind === TickKind.SHIP_UPDATE) sub.fn(ctx);
  };

  return { service, ship, wrapped, transitions, edges, firedAt, second };
}

describe('the wrapping galaxy — UNIVWRAP=1 (GEFUNCS.C:651-705 moveship)', () => {
  it('is actually built with wrapping on — the precondition for every case below', () => {
    // If the loader ever stops reading UNIVWRAP from the environment, this
    // whole file would quietly re-test the telezip arm instead.
    expect(UNIVWRAP).toBe(true);
    expect(UNIVMAX).toBeGreaterThan(1);
  });

  it('carries a ship across the +x edge with its momentum intact', () => {
    const h = makeHarness(
      makeShip({ xcoord: UNIVMAX - INSET, ycoord: 5, heading: 90 }),
    );

    h.second();

    // 19.95 + 0.1 = 20.05, one twentieth of a sector past the +x edge; canon
    // subtracts univmax*2, landing the same distance inside the far edge.
    expect(h.ship.xcoord).toBeCloseTo(-(UNIVMAX - INSET), 6);
    expect(h.ship.ycoord).toBeCloseTo(5, 6);
    // The wrap arm never calls telezip: speed, throttle and hull are untouched.
    expect(h.ship.speed).toBe(STEP_SPEED);
    expect(h.ship.speed2b).toBe(STEP_SPEED);
    expect(h.ship.damage).toBe(0);
    expect(TELEDAM).toBeGreaterThan(0);
    expect(h.edges).toHaveLength(0);
  });

  it('reports the crossing on the x axis, with the pre- and post-wrap coordinates', () => {
    const h = makeHarness(
      makeShip({ xcoord: UNIVMAX - INSET, ycoord: 5, heading: 90 }),
    );

    h.second();

    expect(h.wrapped).toHaveLength(1);
    const evt = h.wrapped[0];
    expect(evt.shipId).toBe('u1:1');
    expect(evt.axis).toBe('x');
    // preCoord is where the integration put the ship — OUTSIDE the galaxy.
    expect(evt.preCoord.x).toBeCloseTo(UNIVMAX + INSET, 6);
    expect(evt.preCoord.y).toBeCloseTo(5, 6);
    expect(evt.postCoord.x).toBeCloseTo(-(UNIVMAX - INSET), 6);
    expect(evt.postCoord.y).toBeCloseTo(5, 6);
    // Milliseconds, not the Date — this payload is the odd one out.
    expect(evt.tickAt).toBe(h.firedAt.getTime());
  });

  it('names the y axis when only y crossed', () => {
    // Heading 180 is due south: y increases, x does not move.
    const h = makeHarness(
      makeShip({ xcoord: 5, ycoord: UNIVMAX - INSET, heading: 180 }),
    );

    h.second();

    expect(h.wrapped).toHaveLength(1);
    expect(h.wrapped[0].axis).toBe('y');
    expect(h.ship.ycoord).toBeCloseTo(-(UNIVMAX - INSET), 6);
    expect(h.ship.xcoord).toBeCloseTo(5, 6);
  });

  it('names both axes when a diagonal run leaves the corner', () => {
    // Heading 135 is south-east: +x and +y in equal measure, 0.1 * sin(45)
    // = 0.0707106... on each axis, which clears a 0.05 inset on both.
    const h = makeHarness(
      makeShip({ xcoord: UNIVMAX - INSET, ycoord: UNIVMAX - INSET, heading: 135 }),
    );

    h.second();

    expect(h.wrapped).toHaveLength(1);
    expect(h.wrapped[0].axis).toBe('both');
    const landing = -(UNIVMAX - 0.0707106781 + INSET);
    expect(h.ship.xcoord).toBeCloseTo(landing, 6);
    expect(h.ship.ycoord).toBeCloseTo(landing, 6);
  });

  it('says nothing for a ship that stayed inside the galaxy', () => {
    const h = makeHarness(makeShip({ xcoord: 5, ycoord: 5, heading: 90 }));

    h.second();

    expect(h.ship.xcoord).toBeCloseTo(5.1, 6);
    expect(h.wrapped).toHaveLength(0);
    expect(h.edges).toHaveLength(0);
  });

  it('hands the sector transition the post-wrap sector, not the overshoot', () => {
    // floor(20.05) would be 20 — a sector outside the galaxy. The transition
    // must read the wrapped coordinate: floor(-19.95) = -20.
    const h = makeHarness(
      makeShip({ xcoord: UNIVMAX - INSET, ycoord: 5, heading: 90 }),
    );

    h.second();

    expect(h.transitions).toHaveLength(1);
    const evt = h.transitions[0];
    expect(evt.fromSector).toEqual({ x: UNIVMAX - 1, y: 5 });
    expect(evt.toSector).toEqual({ x: -UNIVMAX, y: 5 });
    expect(evt.x).toBeCloseTo(-(UNIVMAX - INSET), 6);
    expect(evt.tickAt).toBe(h.firedAt);
  });

  it('wraps the negative edge the same way, in reverse', () => {
    // Heading 270 is due west: x decreases past -univmax and canon ADDS
    // univmax*2, so the ship reappears just inside the +x edge.
    const h = makeHarness(
      makeShip({ xcoord: -(UNIVMAX - INSET), ycoord: 5, heading: 270 }),
    );

    h.second();

    expect(h.ship.xcoord).toBeCloseTo(UNIVMAX - INSET, 6);
    expect(h.wrapped).toHaveLength(1);
    expect(h.wrapped[0].axis).toBe('x');
    expect(h.wrapped[0].preCoord.x).toBeCloseTo(-(UNIVMAX + INSET), 6);
    expect(h.ship.damage).toBe(0);
  });
});
