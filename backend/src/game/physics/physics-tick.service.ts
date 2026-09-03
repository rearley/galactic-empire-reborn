import { applyHyperspaceTransition } from './hyperspace';
import { checkGravity } from './gravity';
import { applySectorChangeEffects } from './sector-change';
import { GalaxyService } from '../galaxy/galaxy.service';
import { Optional, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MOVENGMIN, MOVENGUSE } from '../constants';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import {
  PHYSICS_BOUNDARY_WRAPPED,
  PHYSICS_HYPERSPACE,
  PHYSICS_UNIVERSE_EDGE,
  PHYSICS_SECTOR_TRANSITION,
  PhysicsBoundaryWrappedEvent,
  PhysicsHyperspaceEvent,
  PhysicsSectorTransitionEvent,
  PHYSICS_GRAVITY,
  PHYSICS_DESTRUCT_CANCELLED,
  PhysicsGravityEvent,
} from './physics-events';
import {
  accelerationStep,
  positionIntegration,
  rotationStep,
  sectorOf,
  tryEnergyDebit,
  applyUniverseEdge,
} from './physics-math';
import { TELEDAM, UNIVWRAP, UNIVMAX } from '../constants';
import { ShipClassCacheService } from './ship-class-cache.service';

/**
 * Orchestrates the 6-second PHYSICS tick: rotates, accelerates, moves, debits
 * movement-maintenance, and decrements per-tick countdowns for every active
 * ship. Mutations route through `ShipStateService.mutate()` so the existing
 * 1-second flush picks them up.
 *
 * Ordering inside each tick:
 *  1. Skip if destroyed (status sentinel — currently a no-op; spec FR-001).
 *  2. Conditional block (only when not in orbit / docked):
 *     rotate → accel → move (position) → maintenance debit.
 *  3. Unconditional countdowns: hypha, cantexit (FR-001, FR-008, FR-009).
 *
 * Per-ship faults are caught and logged; a single bad ship MUST NOT abort the
 * batch (FR-015). Ships are processed in ascending composite-shipId order so
 * tests are deterministic (FR-019).
 *
 * @see GEFUNCS.C:441-460 rotship, GEFUNCS.C:469-573 accel,
 *      GEFUNCS.C:617-792 moveship
 * @see specs/006a-physics-tick/research.md
 */
@Injectable()
export class PhysicsTickService implements OnModuleInit {
  private readonly logger = new Logger(PhysicsTickService.name);
  private faultCount = 0;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly events: EventEmitter2,
    // Optional so the hand-built test harnesses keep working; without it a ship
    // simply never encounters gravity, which is the pre-existing behaviour.
    @Optional() private readonly galaxy?: GalaxyService,
  ) {}

  onModuleInit(): void {
    this.tickService.subscribe(TickKind.PHYSICS, (ctx) => this.advanceAll(ctx));
    this.logger.log('Subscribed to PHYSICS tick');
  }

  /** Total per-process fault counter, exposed for the debug controller. */
  getFaultCount(): number {
    return this.faultCount;
  }

  /**
   * Advance every active ship by one physics tick. Caller is the TickService
   * dispatcher; we walk a deterministic ascending-shipId snapshot of the
   * in-memory map and isolate per-ship faults.
   */
  advanceAll(ctx: TickContext): void {
    // FR-019 — ascending composite-shipId order (lexicographic on `${userid}:${shipno}`).
    const ships = this.shipState
      .findAllShips()
      .slice()
      .sort((a, b) => {
        const ka = shipKey(a.userid, a.shipno);
        const kb = shipKey(b.userid, b.shipno);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    for (const ship of ships) {
      try {
        this.advanceOne(ship, ctx);
      } catch (err) {
        this.faultCount += 1;
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(
          `ship ${id} fault on tick ${ctx.tickNumber}: ${stack}`,
          { shipId: id, tickAt: ctx.firedAt },
        );
      }
    }
  }

  /**
   * Apply one tick to a single ship. All mutations route through
   * `ShipStateService.mutate(...)` to set the dirty flag for the flush path.
   */
  private advanceOne(ship: ShipState, ctx: TickContext): void {
    // Destroyed/removed ships are skipped entirely (FR-001).
    // (No `destroyed` flag exists on ShipState today; reserved for future combat work.)

    // Autopilot bearing update — runs before rotation step, even for in-orbit ships
    // (handler auto-breaks orbit, but guard here for safety).
    if (ship.holdcourse > 0 && ship.navTargetX !== null && ship.navTargetY !== null) {
      // Store coords before mutation clears them
      const targetX = ship.navTargetX;
      const targetY = ship.navTargetY;

      // Arrival check: floor-based sector match
      if (Math.floor(ship.xcoord) === targetX && Math.floor(ship.ycoord) === targetY) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.holdcourse = 0;
          s.navTargetX = null;
          s.navTargetY = null;
          // ...and CUT THE ENGINES. Arrival used to disengage the helm and
          // leave the throttle open, so a ship reached its destination and
          // sailed straight through it. At warp 9 a sector takes 43 seconds to
          // cross, so "read the arrival notice, then react" means overshooting.
          //
          // PORT-ORIGINAL either way: canon's `nav` is a read-only bearing
          // report (GECMDS.C:5109-5157) and `holdcourse` is an AI-only field
          // meaning "hold this heading for N ticks, then re-decide"
          // (GECYBS.C:318, GEDROIDS.C:328) — it never means "arrive". With no
          // precedent to follow, the deciding evidence was our own arrival
          // message, which told the player to "cut speed with war 0 / imp 0":
          // whoever wrote it knew the ship kept flying and pushed the problem
          // onto the pilot. An autopilot exists to remove that work.
          // @see docs/DECISIONS.md — autopilot stops on arrival
          s.speed2b = 0;
          s.dirty = true;
        });
        this.events.emit('physics.nav-arrived', {
          userid: ship.userid,
          shipno: ship.shipno,
          x: targetX,
          y: targetY,
        });
        // Skip remaining physics for this tick on arrival
        return;
      }

      // Steer: update head2b to point toward target cell center
      const tx = targetX + 0.5;
      const ty = targetY + 0.5;
      const dx = tx - ship.xcoord;
      const dy = ty - ship.ycoord;
      // Use atan2(dx, -dy) to correctly map to the position-integration coordinate
      // system where heading=0 is north (y-decreasing). Positive dy (target south)
      // must produce a bearing >90° so that cos(bearing)<0 and y increases (southward).
      const newHead2b = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.head2b = newHead2b;
      });
    }

    // Rotation runs ALWAYS, orbit included. `warrti2a` calls
    // rotateship/accel/moveship/destruct with no orbit test (GEMAIN.C:2476-2483),
    // and rotateship itself contains no reference to `where` at all
    // (GEFUNCS.C:433-461) — the `where` gate lives only in moveship (:641, :652).
    //
    // Gating rotation on `where < 10` meant a ship in orbit was told "Now
    // turning to N degrees" and then simply did not turn: the heading only
    // applied once the pilot broke orbit. And because `rep nav` correctly omits
    // heading while orbiting (GECMDS.C:1984-1988), there was no way to see the
    // deferral — every `sca pl` bearing taken in orbit was measured against a
    // stale heading.
    this.applyRotation(ship);

    const inOrbitOrDocked = ship.where >= 10;

    if (!inOrbitOrDocked) {
      this.runConditionalBlock(ship, ctx);
    }

    // Unconditional countdowns — every non-destroyed ship, every tick (FR-008/9).
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      if (s.hypha > 0) s.hypha = Math.max(0, s.hypha - 1);
      if (s.cantexit > 0) s.cantexit = Math.max(0, s.cantexit - 1);
    });
  }

  /**
   * Rotation — unconditional, orbit included. @see GEFUNCS.C:433-461 rotateship
   * Tick does not debit rotation energy; that is paid by the `rotate` command.
   */
  private applyRotation(ship: ShipState): void {
    const maxAccel = this.shipClassCache.getMaxAcceleration(ship.shpclass);
    const rot = rotationStep(ship.heading, ship.head2b, maxAccel);
    if (rot.newHeading !== ship.heading) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.heading = rot.newHeading;
      });
    }
  }

  /** accel → move → maintenance, only when not in orbit/docked. */
  private runConditionalBlock(ship: ShipState, ctx: TickContext): void {
    const maxAccel = this.shipClassCache.getMaxAcceleration(ship.shpclass);

    // 2. Acceleration (US1).
    const accel = accelerationStep(ship.speed, ship.speed2b, maxAccel);
    let speedChanged = accel.newSpeed !== ship.speed;
    let speed2bForcedZero = false;

    if (speedChanged && accel.energyDebit > 0) {
      // Per-debit floor — keeps energy from dropping below the original's
      // fudge floor (constitution: never below MOVENGMIN-class safety).
      const debit = tryEnergyDebit(ship.energy, accel.energyDebit, 0);
      if (debit.ok) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed = accel.newSpeed;
          s.energy = debit.newEnergy;
        });
      } else {
        // Debit refused — force speed2b = 0 so the ship begins to coast down.
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed2b = 0;
        });
        speedChanged = false;
        speed2bForcedZero = true;
      }
    } else if (speedChanged) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.speed = accel.newSpeed;
      });
    }

    // Hyperspace event — emit only when the step actually applied (i.e., the
    // useenergy gate did not refuse the change).
    if (speedChanged && accel.hyperspaceEvent !== null) {
      // The state change belongs inline — this event once had no listener at
      // all, so `where` never became 1 for a player and every `where === 1`
      // gate in the game was dead code.
      //
      // The MESSAGES were the other half of that same gap and outlived the
      // fix: C prints HYSHDN, HYCLDN and HYPERIN on entry (GEFUNCS.C:590-601),
      // and the port printed none of them. A pilot who raised shields, jumped
      // to warp and stopped had no idea they were now unshielded. That is not
      // cosmetic: it is how a new player dies a sector out from the hub without
      // ever knowing what went wrong. The transition therefore reports what it
      // took, and the gateway says so.
      // @see GEFUNCS.C:580-628 hyperspace
      let dropped = { shieldsDropped: false, cloakDropped: false };
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        dropped = applyHyperspaceTransition(s, accel.hyperspaceEvent as 'enter' | 'exit');
      });

      const payload: PhysicsHyperspaceEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        direction: accel.hyperspaceEvent,
        speed: accel.newSpeed,
        tickAt: ctx.firedAt,
        shieldsDropped: dropped.shieldsDropped,
        cloakDropped: dropped.cloakDropped,
      };
      this.events.emit(PHYSICS_HYPERSPACE, payload);

      // Set auto-shield warp-exit trigger (T024 — consumed by ShipTickService.processShip).
      if (accel.hyperspaceEvent === 'exit') {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.recentlyWarpedExit = true;
        });
      }
    }

    // 3. Position integration (US1). Uses the *current* heading + speed.
    if (ship.speed > 0) {
      const preX = ship.xcoord;
      const preY = ship.ycoord;
      const preSector = sectorOf({ x: preX, y: preY });
      const next = positionIntegration(preX, preY, ship.heading, ship.speed);

      // Universe boundary — only in normal space (where <= 1).
      // @see GEFUNCS.C:651-705 moveship — wrap and no-wrap arms
      let wrappedX = next.x;
      let wrappedY = next.y;
      let xWrapped = false;
      let yWrapped = false;
      let hitEdge = false;
      if (ship.where <= 1) {
        const ex = applyUniverseEdge(next.x, UNIVMAX, UNIVWRAP);
        const ey = applyUniverseEdge(next.y, UNIVMAX, UNIVWRAP);
        xWrapped = UNIVWRAP && ex.value !== next.x;
        yWrapped = UNIVWRAP && ey.value !== next.y;
        hitEdge = ex.hitEdge || ey.hitEdge;
        wrappedX = ex.value;
        wrappedY = ey.value;
      }

      const postSector = sectorOf({ x: wrappedX, y: wrappedY });

      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.xcoord = wrappedX;
        s.ycoord = wrappedY;
        if (hitEdge) {
          // telezip: the wall takes your momentum and 17 hull.
          // @see GEFUNCS.C:819-833
          s.speed = 0;
          s.speed2b = 0;
          s.damage = s.damage + TELEDAM;

          // ...and drops you out of hyperspace. C does NOT, and that is an
          // oversight rather than a design: telezip zeroes speed and speed2b
          // and never calls hyperspace(ptr,usrn,0), while the only exit
          // transition (GEFUNCS.C:537-539) requires `speed/1000 >= 1` — which
          // is now impossible. A ship that strikes the perimeter at warp is
          // left flagged as being IN hyperspace at a dead stop, permanently,
          // and every `where === 1` gate treats it as still warping. The
          // escape in the original is to `war 1` and then `war 0` again, which
          // no player would ever deduce.
          // Fixed per the standing rule that the original's defects are not
          // reproduced. @see docs/DECISIONS.md
          if (s.where === 1) s.where = 0;
        }
      });

      if (hitEdge) {
        this.events.emit(PHYSICS_UNIVERSE_EDGE, {
          shipId: shipKey(ship.userid, ship.shipno),
          damage: TELEDAM,
        });
      }

      // C calls gravity() from moveship on every move (GEFUNCS.C:794-795).
      this.applyGravity(ship, postSector, ctx);

      if (xWrapped || yWrapped) {
        const axis = xWrapped && yWrapped ? 'both' : xWrapped ? 'x' : 'y';
        const wrapped: PhysicsBoundaryWrappedEvent = {
          shipId: shipKey(ship.userid, ship.shipno),
          axis,
          preCoord: { x: next.x, y: next.y },
          postCoord: { x: wrappedX, y: wrappedY },
          tickAt: ctx.firedAt.getTime(),
        };
        this.events.emit(PHYSICS_BOUNDARY_WRAPPED, wrapped);
      }

      if (preSector.x !== postSector.x || preSector.y !== postSector.y) {
        // C clears `hostile` and cancels an armed self-destruct on reaching a
        // neutral sector, right here inside moveship. @see GEFUNCS.C:724-730
        let destructCancelled = false;
        this.shipState.mutate(ship.userid, ship.shipno, (v) => {
          destructCancelled = applySectorChangeEffects(v, postSector);
        });
        if (destructCancelled) {
          this.events.emit(PHYSICS_DESTRUCT_CANCELLED, {
            shipId: shipKey(ship.userid, ship.shipno),
            tickAt: ctx.firedAt,
          });
        }

        const payload: PhysicsSectorTransitionEvent = {
          shipId: shipKey(ship.userid, ship.shipno),
          fromSector: preSector,
          toSector: postSector,
          x: wrappedX,
          y: wrappedY,
          tickAt: ctx.firedAt,
        };
        this.events.emit(PHYSICS_SECTOR_TRANSITION, payload);
      }
    }

    // 4. Movement-maintenance debit — player ships only (FR-006).
    //    `status === 1` (GESTAT_USER) gates the entire block in the original.
    if (ship.speed > 0 && ship.status === 1 && !speed2bForcedZero) {
      const debit = tryEnergyDebit(ship.energy, MOVENGUSE, 0);
      if (debit.ok) {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.energy = debit.newEnergy;
          // Post-debit floor cutoff: if we're now below MOVENGMIN, force coast-down.
          if (s.energy < MOVENGMIN) s.speed2b = 0;
        });
      } else {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.speed2b = 0;
        });
      }
    }
  }
  /**
   * Planet and wormhole proximity — the only reason to be careful where you
   * point a warp run. Fly into a planet and the hull is written off; fly into
   * a wormhole and you come out at its destination, 5.5 damage worse off and
   * with every torpedo and missile lock cleared.
   *
   * Neither existed in the port: `gravity` had no implementation and the
   * wormhole rows the galaxy generator writes had no reader.
   *
   * @see GEFUNCS.C:836-905 gravity
   */
  private applyGravity(ship: ShipState, sector: { x: number; y: number }, ctx: TickContext): void {
    if (!this.galaxy) return;

    const bodies = this.galaxy.getGravityBodies(sector.x, sector.y);
    if (bodies.length === 0) return;

    for (const event of checkGravity(ship, bodies)) {
      const payload: PhysicsGravityEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        plnum: event.plnum,
        isWormhole: event.isWormhole,
        band: event.band,
        tickAt: ctx.firedAt,
      };
      this.events.emit(PHYSICS_GRAVITY, payload);

      if (!event.effect) continue;

      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        if (event.effect!.kind === 'crash') {
          s.damage = event.effect!.damage;
          return;
        }
        const w = event.effect as { destination: { xcoord: number; ycoord: number }; damage: number };
        s.xcoord = w.destination.xcoord;
        s.ycoord = w.destination.ycoord;
        s.damage += w.damage;
        // cleartm(usrn) — a transit shakes off everything chasing you.
        for (let i = 0; i < s.ltorpsDistance.length; i++) s.ltorpsDistance[i] = 0;
        for (let i = 0; i < s.ltorpsChannel.length; i++) s.ltorpsChannel[i] = 255;
        for (let i = 0; i < s.lmisslDistance.length; i++) s.lmisslDistance[i] = 0;
        for (let i = 0; i < s.lmisslChannel.length; i++) s.lmisslChannel[i] = 255;
      });

      // A crash or a jump ends this ship's move.
      break;
    }
  }

}
