import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../_ship-management-constants';

/** Case-insensitive string equality (sameas from feature 003 parsing layer). @see GECMDS.C */
function sameas(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Planet index of the Zygor galactic market in the neutral zone (sector 0,0). */
const ZYGOR_PLNUM_1 = 0 as const;
const ZYGOR_PLNUM_2 = 1 as const;

/** Minimum population for a maintenance facility. @see GECMDS.C:4485 MAINT4 */
const MAINT_MIN_POPULATION = 25_000 as const;

/**
 * Handles `maint` — repairs the ship at an inhabited friendly planet in orbit.
 *
 * Cost: 200 cr at a normal friendly planet; 2500 cr at the Zygor neutral-zone planet.
 * Effect: sets ShipState.repair = floor(damage/3) + 1 (consumed by repair sub-system).
 *
 * Rejection gates (canonical order from GECMDS.C:4452):
 *  FR-206: not in orbit
 *  FR-207: planet uninhabited or population < 25000
 *  FR-208: cantexit > 0 (combat-locked)
 *  FR-209: neutral zone but not Zygor
 *  FR-204: damage == 0
 *  FR-205: insufficient cash
 *
 * Note: planet password gate (FR-210) is deferred to feature 005. See research.md D3.
 *
 * @see GECMDS.C:4452 cmd_maint
 */
@Injectable()
export class MaintHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly planetService: PlanetStateService,
    private readonly prisma: PrismaService,
  ) {}

  readonly command: Command = {
    keyword: 'maint',
    aliases: ['mai'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[] = []): Promise<CommandResult> {
    // FR-206: must be in orbit.
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_NOT_ORBIT), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planet = this.planetService.get(xsect, ysect, plnum);

    // FR-207: uninhabited or too small.
    const men = planet ? Number(planet.items[0]?.qty ?? 0n) : 0;
    if (!planet || men < MAINT_MIN_POPULATION) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_NO_FACILITY), category: 'system' }] };
    }

    // FR-208: combat-locked.
    if (ship.cantexit > 0) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_COMBAT), category: 'system' }] };
    }

    const inNeutralZone = xsect === 0 && ysect === 0;
    const isZygor = inNeutralZone && (plnum === ZYGOR_PLNUM_1 || plnum === ZYGOR_PLNUM_2);

    // FR-209: neutral zone but not Zygor.
    if (inNeutralZone && !isZygor) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_NZ), category: 'system' }] };
    }

    // FR-014-060/061/062: planet password gate — inserted between FR-209 and FR-204.
    // @see GECMDS.C:4471 MAINT2, :4479 MAINT3, research.md D10
    const pwd = planet.password;
    if (pwd && !sameas(pwd, 'none')) {
      const providedArg = args[0] ?? '';
      if (!providedArg) {
        return { lines: [{ text: formatMessage(MessageId.MAINT2), category: 'system' }] };
      }
      if (!sameas(pwd, providedArg)) {
        return { lines: [{ text: formatMessage(MessageId.MAINT3), category: 'system' }] };
      }
    }

    // FR-204: no damage.
    if (ship.damage <= 0) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_NO_DAMAGE), category: 'system' }] };
    }

    const price = BigInt(isZygor ? MAINT_COST_NEUTRAL : MAINT_COST_NORMAL);

    // Load current cash from Postgres (source of truth for cash).
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });
    const cash = userRow?.cash ?? 0n;

    // FR-205: insufficient funds.
    if (cash < price) {
      return { lines: [{ text: formatMessage(MessageId.MAINT_NO_CASH), category: 'system' }] };
    }

    // Atomic: debit cash, queue repair.
    const repairAmt = Math.floor(ship.damage / 3) + 1;
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { decrement: price } },
    });
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.repair = repairAmt;
    });

    return {
      lines: [{ text: formatMessage(MessageId.MAINT_OK, repairAmt), category: 'success' }],
    };
  }
}
