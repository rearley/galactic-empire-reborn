import { Inject, Injectable } from '@nestjs/common';
import { UserRepository } from '../player/user.repository';
import { ShipStateService } from './ship-state.service';
import { ShipState } from './ship-state.types';
import { PLANET_STATE_PORT, type PlanetStatePort } from '../planet/planet-state.port';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../commands/_ship-management-constants';

/** Planet index of the Zygor galactic market in the neutral zone (sector 0,0). */
// Canon: `if (plnum == 1 || plnum == 2)` where `plnum = warsptr->where - 10`
// (GECMDS.C:4500). Planets in this port are 1-based — s00.ts numbers Zygor 1
// and Tahanian Station 2, and orbit.handler.ts sets `where = 10 + plnum` — so
// these are 1 and 2. They were 0 and 1, which refused Tahanian Station outright
// and admitted a plnum 0 that does not exist.
const ZYGOR_PLNUM_1 = 1 as const;
const ZYGOR_PLNUM_2 = 2 as const;
const MAINT_MIN_POPULATION = 25_000 as const;

export type GateResult =
  | { ok: true; price: bigint; repairAmt: number }
  | { ok: false; reason: 'not-in-orbit' | 'no-facility' | 'combat-locked' | 'nz-not-zygor' | 'password-required' | 'wrong-password' | 'insufficient-cash' };

/**
 * Domain service encapsulating the gate logic, cash debit, and repair-queue
 * mutation for ship maintenance. Its only caller is `MaintHandlerService`, the
 * manual `maint` command.
 *
 * It was built as a shared seam for a second, tick-layer caller: spec 019's
 * `set auto-repair`, which would have hired a crew for you. That option was a
 * port invention and was removed on 2026-09-09 — canon has no auto-repair — so
 * the seam now has one side. It is kept because the tick layer MUST NOT import
 * command handlers, and anything that ever repairs on a tick belongs here.
 *
 * @see GECMDS.C:cmd_maint — gate logic and cost
 * @see specs/019-physics-polish/research.md R3
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly shipState: ShipStateService,
    @Inject(PLANET_STATE_PORT) private readonly planetService: PlanetStatePort,
    private readonly users: UserRepository,
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
   * @param passwordArg Optional planet password provided by user input.
   *   Undefined skips the password gate entirely, which is why it is optional:
   *   the removed auto-repair tick caller had no password to offer.
   * @see GECMDS.C:4452 cmd_maint
   */
  async evaluateGates(ship: ShipState, passwordArg?: string): Promise<GateResult> {
    if (ship.where < 10) return { ok: false, reason: 'not-in-orbit' };

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planet = this.planetService.get(xsect, ysect, plnum);

    // CANON ORDER (GECMDS.C:4468-4510): password, THEN facility, THEN combat
    // lock, THEN the neutral-zone test. The port ran the password check last,
    // so a visiting captain learned whether a stranger's colony was big enough
    // to service them before being asked for the password.
    //
    // The password gate is command-layer only. Passing undefined skips it,
    // which has no canon counterpart — canon always has a pilot to ask.
    // @see GECMDS.C:4471 MAINT2, :4479 MAINT3
    if (passwordArg !== undefined && planet?.password && planet.password.toLowerCase() !== 'none') {
      if (!passwordArg) return { ok: false, reason: 'password-required' };
      if (planet.password.toLowerCase() !== passwordArg.toLowerCase()) {
        return { ok: false, reason: 'wrong-password' };
      }
    }

    // `plptr->userid[0] == 0 || plptr->items[I_MEN].qty < 25000L` -> MAINT8.
    // BOTH halves matter: the planet must be COLONISED, not merely populated.
    // Without the ownership test a damaged captain could orbit any wild world
    // with 25,000 natives and buy a full repair for 200 credits.
    // @see GECMDS.C:4486
    const men = planet ? Number(planet.items[0]?.qty ?? 0n) : 0;
    if (!planet || !planet.userid || men < MAINT_MIN_POPULATION) {
      return { ok: false, reason: 'no-facility' };
    }

    if (ship.cantexit > 0) return { ok: false, reason: 'combat-locked' };

    const inNeutralZone = xsect === 0 && ysect === 0;
    const isZygor = inNeutralZone && (plnum === ZYGOR_PLNUM_1 || plnum === ZYGOR_PLNUM_2);
    if (inNeutralZone && !isZygor) return { ok: false, reason: 'nz-not-zygor' };


    const price = BigInt(isZygor ? MAINT_COST_NEUTRAL : MAINT_COST_NORMAL);
    const cash = (await this.users.getCash(ship.userid)) ?? 0n;
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
  async applyMaintenance(ship: ShipState, price: bigint, repairAmt: number): Promise<boolean> {
    // The balance check in `evaluateGates` ran before an await, so it is a
    // snapshot: two `mai` commands in flight together both passed it and both
    // decremented. The check is repeated here in the same statement that
    // spends, which is the only place it cannot be raced. The repair is queued
    // only if the money actually moved.
    // @see docs/audits/2026-09-09-security-review.md M1
    const paid = await this.users.debitIfAffordable(ship.userid, price);
    if (!paid) return false;

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.repair = repairAmt;
    });
    return true;
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
      const paid = await this.applyMaintenance(ship, gate.price, gate.repairAmt);
      if (!paid) return { ok: false, reason: 'insufficient-cash' };
    }
    return gate;
  }

}
