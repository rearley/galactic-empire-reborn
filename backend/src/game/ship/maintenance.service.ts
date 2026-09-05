import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from './ship-state.service';
import { ShipState } from './ship-state.types';
import { PlanetStateService } from '../planet/planet-state.service';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../commands/_ship-management-constants';

/** Planet index of the Zygor galactic market in the neutral zone (sector 0,0). */
const ZYGOR_PLNUM_1 = 0 as const;
const ZYGOR_PLNUM_2 = 1 as const;
const MAINT_MIN_POPULATION = 25_000 as const;

export type GateResult =
  | { ok: true; price: bigint; repairAmt: number }
  | { ok: false; reason: 'not-in-orbit' | 'no-facility' | 'combat-locked' | 'nz-not-zygor' | 'password-required' | 'wrong-password' | 'insufficient-cash' };

/**
 * Domain service encapsulating the gate logic, cash debit, and repair-queue
 * mutation for ship maintenance. Single source of truth shared by:
 *  - `MaintHandlerService` (manual `maint` command)
 *  - `ShipTickService` (auto-repair tick consumer, US3/FR-005)
 *
 * The tick layer MUST NOT import command handlers. This service is the shared seam.
 *
 * @see GECMDS.C:cmd_maint — gate logic and cost
 * @see specs/019-physics-polish/research.md R3
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly planetService: PlanetStateService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Evaluate maintenance gates for a ship. Returns ok=true with price and
   * repairAmt when all gates pass, ok=false with a reason otherwise.
   *
   * Canonical gate order from GECMDS.C:4452:
   *  1. Must be in orbit (where >= 10)              FR-206
   *  2. Planet inhabited, population >= 25000        FR-207
   *  3. Not in combat lock (cantexit === 0)          FR-208
   *  4. Neutral zone: only Zygor planet allowed      FR-209
   *  5. Password gate (optional — command-layer)     FR-210
   *  6. Must have damage (damage > 0)                FR-204
   *  7. Sufficient cash                              FR-205
   *
   * @param passwordArg Optional planet password provided by user input (command layer only).
   *   Auto-repair callers pass undefined — password gate skipped for tick-layer consumers.
   * @see GECMDS.C:4452 cmd_maint
   */
  async evaluateGates(ship: ShipState, passwordArg?: string): Promise<GateResult> {
    if (ship.where < 10) return { ok: false, reason: 'not-in-orbit' };

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planet = this.planetService.get(xsect, ysect, plnum);

    const men = planet ? Number(planet.items[0]?.qty ?? 0n) : 0;
    if (!planet || men < MAINT_MIN_POPULATION) return { ok: false, reason: 'no-facility' };

    if (ship.cantexit > 0) return { ok: false, reason: 'combat-locked' };

    const inNeutralZone = xsect === 0 && ysect === 0;
    const isZygor = inNeutralZone && (plnum === ZYGOR_PLNUM_1 || plnum === ZYGOR_PLNUM_2);
    if (inNeutralZone && !isZygor) return { ok: false, reason: 'nz-not-zygor' };

    // FR-210: password gate (command layer only — tick callers pass undefined).
    // @see GECMDS.C:4471 MAINT2, :4479 MAINT3
    if (passwordArg !== undefined && planet.password && planet.password.toLowerCase() !== 'none') {
      if (!passwordArg) return { ok: false, reason: 'password-required' };
      if (planet.password.toLowerCase() !== passwordArg.toLowerCase()) {
        return { ok: false, reason: 'wrong-password' };
      }
    }


    const price = BigInt(isZygor ? MAINT_COST_NEUTRAL : MAINT_COST_NORMAL);
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });
    const cash = userRow?.cash ?? 0n;
    if (cash < price) return { ok: false, reason: 'insufficient-cash' };

    const repairAmt = Math.floor(ship.damage / 3) + 1;
    return { ok: true, price, repairAmt };
  }

  /**
   * Apply maintenance: debit cash and queue repair. Caller must have already
   * verified gates via evaluateGates or the combined runMaintenance call.
   *
   * @see GECMDS.C:4452 cmd_maint — debit + repair queue mutation
   */
  async applyMaintenance(ship: ShipState, price: bigint, repairAmt: number): Promise<void> {
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { decrement: price } },
    });
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.repair = repairAmt;
    });
  }

  /**
   * Evaluate gates and run maintenance in one call. Returns the gate result.
   * On ok=true, maintenance has been applied (cash debited, repair queued).
   *
   * @param passwordArg Optional planet password from user input (command layer).
   *   Tick-layer callers omit this so the password gate is skipped.
   * @see GECMDS.C:cmd_maint
   */
  async runMaintenance(ship: ShipState, passwordArg?: string): Promise<GateResult> {
    const gate = await this.evaluateGates(ship, passwordArg);
    if (gate.ok) {
      await this.applyMaintenance(ship, gate.price, gate.repairAmt);
    }
    return gate;
  }

  /**
   * Auto-repair tick consumer (US3): run maintenance silently for ships with
   * autoRepair=true. No player-facing message on success.
   * Only queues a repair if one is not already in progress (repair === 0).
   *
   * @see specs/019-physics-polish/research.md R3
   */
  async runAutoRepair(ship: ShipState): Promise<void> {
    // Don't double-queue if a repair is already in progress
    if (ship.repair > 0) return;
    await this.runMaintenance(ship);
  }
}
