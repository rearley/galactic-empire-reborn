import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { prismaShipToState, stateToPrismaUpdate } from '../ship/ship-state.mappers';
import { shipKey } from '../ship/ship-state.types';
import { CYB_MAXCASH } from '../constants';
import type { CybertronLoadout } from './cyb-decisions';

/** Fields needed to create a new Cybertron spawn slot. */
export interface SpawnSlotInit {
  userid: string;
  shipno: number;
  classNumber: number;
  shipname: string;
  xcoord: number;
  ycoord: number;
  phasrtype: number;
  shieldtype: number;
  loadout: CybertronLoadout;
  cybskill: number;
  tick: number;
}

/**
 * Persistence layer for Cybertron AI — boot-time hydrate, spawn-row create,
 * and immediate-flush hooks for significant events.
 *
 * All cash writes for /^Cybrg-/ users MUST go through clampCybertronCash.
 *
 * @see GECYBS.C:88 cyb_init — User+Ship row creation
 * @see specs/007-cybertron-ai/plan.md R-11 (flush cadence), T060 (cash clamp)
 */
@Injectable()
export class CybertronRepository {
  private readonly logger = new Logger(CybertronRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipState: ShipStateService,
  ) {}

  /**
   * Clamp a Cybertron's cash balance to CYB_MAXCASH.
   * Applied at every persistence boundary for /^Cybrg-/ users.
   * @see GEMAIN.H CYB_MAXCASH=2000000
   * @see specs/007-cybertron-ai/tasks.md T060 — single centralized helper
   */
  clampCybertronCash(amount: bigint): bigint {
    const max = BigInt(CYB_MAXCASH);
    return amount > max ? max : amount < 0n ? 0n : amount;
  }

  /**
   * Load all Cybrg-* User+Ship rows from Postgres into ShipStateService.
   * Clamps User.cash to CYB_MAXCASH on load.
   * @see GECYBS.C:88 cyb_init — loads existing Cybertron User+Ship from DB
   * @see specs/007-cybertron-ai/plan.md R-7 (single Cybrg- prefix covers Sarterns too)
   */
  async hydrateAll(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { userid: { startsWith: 'Cybrg-' } },
      include: { ships: true },
    });

    let count = 0;
    for (const user of users) {
      // Clamp cash at load time (FR-020)
      if (user.cash > BigInt(CYB_MAXCASH)) {
        await this.prisma.user.update({
          where: { userid: user.userid },
          data: { cash: this.clampCybertronCash(user.cash) },
        });
      }

      for (const ship of user.ships) {
        const state = prismaShipToState(ship as Parameters<typeof prismaShipToState>[0]);
        state.status = 2; // GESTAT_AUTO
        state.dirty = false;
        this.shipState.loadShip(state);
        count++;
      }
    }
    this.logger.log(`Hydrated ${count} Cybertron/Sartern ships`);
  }

  /**
   * Create a new Cybertron spawn row in a single Prisma transaction.
   * @see GECYBS.C:148-185 cyb_init — ship row construction
   */
  async createSpawn(slot: SpawnSlotInit): Promise<void> {
    const cash = this.clampCybertronCash(BigInt(slot.loadout.gold));

    await this.prisma.$transaction(async (tx) => {
      // Upsert User row (may already exist from a previous spawn cycle)
      await tx.user.upsert({
        where: { userid: slot.userid },
        create: { userid: slot.userid, cash },
        update: { cash },
      });

      // Create Ship row
      await tx.ship.create({
        data: {
          userid: slot.userid,
          shipno: slot.shipno,
          shipname: slot.shipname,
          shpclass: slot.classNumber,
          xcoord: slot.xcoord,
          ycoord: slot.ycoord,
          phasr: 100,
          phasrtype: slot.phasrtype,
          shieldtype: slot.shieldtype,
          cybmine: 255,
          cybskill: slot.cybskill,
          tick: slot.tick,
          cybupdate: 100,
          holdcourse: 0,
          status: 2, // GESTAT_AUTO
          items: [
            BigInt(slot.loadout.fluxpod),
            0n, // I_MISSILE
            0n,
            0n,
            0n,
            0n,
            BigInt(slot.loadout.decoys),
            BigInt(slot.loadout.torpedo),
            0n,
            0n,
            0n,
            BigInt(slot.loadout.mine),
            0n,
            BigInt(slot.loadout.jammers),
            0n,
            BigInt(slot.loadout.gold),
          ],
        },
      });
    });
  }

  /**
   * Immediately flush User rows to Postgres for significant-event durability.
   * Applies CYB_MAXCASH clamp to any /^Cybrg-/ userid.
   * @see specs/007-cybertron-ai/plan.md FR-019, R-11
   */
  async flushUsersImmediate(userids: string[]): Promise<void> {
    for (const userid of userids) {
      try {
        const ship = this.shipState.findByUserid(userid)[0];
        if (!ship) continue;

        let cash = 0n;
        const userRow = await this.prisma.user.findUnique({ where: { userid } });
        if (userRow) {
          cash = userid.startsWith('Cybrg-')
            ? this.clampCybertronCash(userRow.cash)
            : userRow.cash;
          await this.prisma.user.update({ where: { userid }, data: { cash } });
        }
      } catch (err: unknown) {
        this.logger.error(`flushUsersImmediate failed for ${userid}:`, err);
      }
    }
  }

  /**
   * Transfer Cybertron gold on kill: add victim's clamped cash to attacker, zero victim.
   * Executes as a single Prisma transaction for atomicity.
   * @see GECYBS.C:104-105 kill gold transfer
   * @see specs/007-cybertron-ai/tasks.md T061 (FR-005a, R-4)
   */
  async transferGold(victimUserid: string, attackerUserid: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const victim = await tx.user.findUnique({ where: { userid: victimUserid } });
      if (!victim || victim.cash <= 0n) return;

      const gold = this.clampCybertronCash(victim.cash);

      // Zero victim cash
      await tx.user.update({ where: { userid: victimUserid }, data: { cash: 0n } });

      // Add to attacker (upsert in case attacker row doesn't exist yet)
      const attacker = await tx.user.findUnique({ where: { userid: attackerUserid } });
      if (attacker) {
        await tx.user.update({
          where: { userid: attackerUserid },
          data: { cash: { increment: gold } },
        });
      }
    });
  }

  /**
   * Immediately flush Ship rows to Postgres for significant-event durability.
   * @see specs/007-cybertron-ai/plan.md FR-019, R-11
   */
  async flushShipsImmediate(shipKeys: string[]): Promise<void> {
    for (const key of shipKeys) {
      try {
        const [userid, shipnoStr] = key.split(':');
        const shipno = parseInt(shipnoStr, 10);
        const state = this.shipState.get(userid, shipno);
        if (!state) continue;
        await this.prisma.ship.update({
          where: { userid_shipno: { userid, shipno } },
          data: stateToPrismaUpdate(state),
        });
        state.dirty = false;
      } catch (err: unknown) {
        this.logger.error(`flushShipsImmediate failed for ${key}:`, err);
      }
    }
  }
}
