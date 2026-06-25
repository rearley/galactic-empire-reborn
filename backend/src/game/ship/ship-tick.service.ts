import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind, Unsubscribe } from '../tick/tick.types';
import { ShipStateService } from './ship-state.service';
import { ShipState } from './ship-state.types';
import { decideOverspeed, OverspeedRng } from './ship-overspeed';
import { MaintenanceService } from './maintenance.service';
import { decideAutoShield } from './auto-shield';
import { SHIELDDM } from '../constants';

/**
 * Drives the 1-second SHIP_UPDATE tick for all active ships.
 * Subscribes to TickKind.SHIP_UPDATE in OnModuleInit; unsubscribes on OnModuleDestroy.
 *
 * Per-tick per-ship pipeline:
 *  1. Overspeed engine break evaluation (US2, FR-003/004)
 *  2. Auto-repair (US3, FR-005) when ship.autoRepair === true
 *  3. Auto-shield (US4, FR-006) when ship.autoShield === true
 *
 * Pattern parallels PhysicsTickService. Faults are isolated per ship.
 *
 * @see backend/src/game/physics/physics-tick.service.ts PhysicsTickService
 * @see GEMAIN.C:main loop (TICKTIME2=1s ship-update cadence)
 */
@Injectable()
export class ShipTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShipTickService.name);
  private unsubscribe: Unsubscribe | null = null;

  /** Deterministic RNG wrapper reusing Math.random for now; tests inject deterministic. */
  private readonly rng: OverspeedRng = {
    intBelow: (n: number) => Math.floor(Math.random() * n),
  };

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.tickService.subscribe(TickKind.SHIP_UPDATE, (ctx) =>
      this.onShipUpdateTick(ctx),
    );
    this.logger.log('Subscribed to SHIP_UPDATE tick');
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.logger.log('Unsubscribed from SHIP_UPDATE tick');
  }

  private onShipUpdateTick(ctx: TickContext): void {
    const ships = this.shipState.findAllShips();
    for (const ship of ships) {
      try {
        this.processShip(ship, ctx);
      } catch (err: unknown) {
        const id = `${ship.userid}:${ship.shipno}`;
        const msg = err instanceof Error ? err.stack : String(err);
        this.logger.error(`ShipTickService fault for ${id} on tick ${ctx.tickNumber}: ${msg}`);
      }
    }
  }

  /**
   * Apply one ship-update tick to a single ship.
   * All mutations route through ShipStateService.mutate.
   */
  private processShip(ship: ShipState, ctx: TickContext): void {
    // 1. Overspeed engine break (US2, FR-003/004).
    const overspeed = decideOverspeed(ship, this.rng);
    switch (overspeed.kind) {
      case 'warn':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.warncntr = overspeed.warncntr;
        });
        break;
      case 'break':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.warncntr = overspeed.warncntr;
          s.topspeed = overspeed.topspeed;
          s.speed2b = overspeed.speed2b;
          s.damage += overspeed.damage;
        });
        break;
      case 'recover':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.topspeed = overspeed.topspeed;
          s.speed2b = overspeed.speed2b;
          s.warncntr = overspeed.warncntr;
        });
        break;
      case 'noop':
        break;
    }
    // TODO (US2): emit WARPBRK/WARPFAST/WARPSPD events to ship's socket when
    // GameGateway socket-routing is available for per-ship messages.

    // 2. Repair tick — GEFUNCS.C:390 repairship
    // Each 1s tick: subtract 3 hull damage, recalculate queue, clear when done.
    if (ship.repair > 0) {
      if (ship.cantexit > 0) {
        // Combat interrupts repair — GEFUNCS.C:397
        this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.repair = 0; });
      } else {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.damage = s.damage > 3 ? s.damage - 3 : 0;
          s.repair = Math.floor(s.damage / 3);
          if (s.repair <= 1) {
            s.repair = 0;
            s.damage = 0;
            s.phasr = 100;
          }
        });
      }
    }

    // 2b. Subsystem repair — temporary disruptions recover toward operational each tick.
    // tactical/helm/cloak: negative values increment by +1 toward 0.
    // firecntl: positive values decrement by -1 toward 0.
    // shield (SHIELDDM state): negative shield value increments toward 0; when it reaches 0
    //   shieldstat is cleared to 0 so the player can re-raise shields.
    // Unlike hull repair, cantexit does NOT interrupt — disruptions are temporary effects.
    // @see GECMDS.C C-010 / S-007 (Plan 4 Task 3)
    const needsSubsystemRepair = ship.tactical < 0 || ship.helm < 0 || ship.cloak < 0
      || ship.firecntl > 0 || (ship.shieldstat === SHIELDDM && ship.shield < 0);
    if (needsSubsystemRepair) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        if (s.tactical < 0) s.tactical = Math.min(0, s.tactical + 1);
        if (s.helm < 0) s.helm = Math.min(0, s.helm + 1);
        if (s.cloak < 0) s.cloak = Math.min(0, s.cloak + 1);
        if (s.firecntl > 0) s.firecntl = Math.max(0, s.firecntl - 1);
        if (s.shieldstat === SHIELDDM && s.shield < 0) {
          s.shield = Math.min(0, s.shield + 1);
          if (s.shield >= 0) {
            s.shieldstat = 0; // back to "down" state so player can re-raise shields
          }
        }
      });
    }

    // 3. Shield recharge — GEFUNCS.C:2491 shieldchg
    // Each 1s tick: charge by shieldtype*3, costs shieldtype*SHENGUSE energy.
    if (ship.shieldstat === 1 && ship.shieldtype > 0 && ship.shieldtype < 20) {
      const maxCharge = 40 + ship.shieldtype * 10;
      if (ship.shield < maxCharge) {
        const energyCost = ship.shieldtype * 100; // SHENGUSE=100
        if (ship.energy >= energyCost) {
          this.shipState.mutate(ship.userid, ship.shipno, (s) => {
            s.energy = Math.max(0, s.energy - energyCost);
            s.shield = Math.min(maxCharge, s.shield + s.shieldtype * 3);
          });
        }
      }
    }

    // 4. Auto-repair (US3, FR-005).
    if (ship.autoRepair === true) {
      void this.maintenanceService.runAutoRepair(ship);
    }

    // 3. Auto-shield (US4, FR-006).
    if (ship.autoShield === true && ship.shieldstat === 0) {
      const decision = decideAutoShield(ship);
      if (decision.action === 'raise') {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.shieldstat = 1;
          s.recentlyWarpedExit = false;
          s.recentlySelfFiredTorp = false;
        });
      }
    }

    void ctx;
  }
}
