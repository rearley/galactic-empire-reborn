import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MOVENGMIN, MOVENGUSE } from '../constants';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import {
  PHYSICS_HYPERSPACE,
  PHYSICS_SECTOR_TRANSITION,
  PhysicsHyperspaceEvent,
  PhysicsSectorTransitionEvent,
} from './physics-events';
import {
  accelerationStep,
  positionIntegration,
  rotationStep,
  sectorOf,
  tryEnergyDebit,
} from './physics-math';
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

  /** rotate → accel → move → maintenance, only when not in orbit/docked. */
  private runConditionalBlock(ship: ShipState, ctx: TickContext): void {
    const maxAccel = this.shipClassCache.getMaxAcceleration(ship.shpclass);

    // 1. Rotation (US2). Tick does not debit rotation energy — that's paid by `rotate`.
    const rot = rotationStep(ship.heading, ship.head2b, maxAccel);
    if (rot.newHeading !== ship.heading) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.heading = rot.newHeading;
      });
    }

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
      const payload: PhysicsHyperspaceEvent = {
        shipId: shipKey(ship.userid, ship.shipno),
        direction: accel.hyperspaceEvent,
        speed: accel.newSpeed,
        tickAt: ctx.firedAt,
      };
      this.events.emit(PHYSICS_HYPERSPACE, payload);
    }

    // 3. Position integration (US1). Uses the *current* heading + speed.
    if (ship.speed > 0) {
      const preX = ship.xcoord;
      const preY = ship.ycoord;
      const preSector = sectorOf({ x: preX, y: preY });
      const next = positionIntegration(preX, preY, ship.heading, ship.speed);
      const postSector = sectorOf(next);

      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.xcoord = next.x;
        s.ycoord = next.y;
      });

      if (preSector.x !== postSector.x || preSector.y !== postSector.y) {
        const payload: PhysicsSectorTransitionEvent = {
          shipId: shipKey(ship.userid, ship.shipno),
          fromSector: preSector,
          toSector: postSector,
          x: next.x,
          y: next.y,
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
}
