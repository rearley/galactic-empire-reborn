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
  /**
   * The class's max warp. REQUIRED, and not defaulted, on purpose.
   *
   * Prisma declares `topspeed Int @default(0)` and this field was simply never
   * written, so every Cybertron ever spawned had topspeed 0 — and every speed
   * order in `cybLives` is derived from it, so all 24 in a live galaxy sat
   * motionless for the whole of round 4. Canon assigns it at ship creation,
   * `tmpshp.topspeed = shipclass[tmpshp.shpclass].max_warp` (GEFUNCS.C:278).
   */
  topspeed: number;
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
        // Skip already-dead Cybertrons. Their slot stays in the DB but is
        // not loaded into memory — otherwise runKillResolution re-processes
        // the persisted kill on the first physics tick after boot and emits
        // a phantom COMBAT_SHIP_DESTROYED to all clients. The spawn-slot
        // tick replenishes the slot via createSpawn (upsert).
        if (ship.damage >= 100) continue;

        const state = prismaShipToState(ship as Parameters<typeof prismaShipToState>[0]);
        state.status = 2; // GESTAT_AUTO
        state.dirty = false;
        // Kick-start movement — original sets speed2b = topspeed*500 on load (@see GECYBS.C:134)
        // Our topspeed is in warp units where warp 1 = 1000, so multiply by 1000
        if (state.speed2b === 0 && state.topspeed > 0) {
          state.speed2b = state.topspeed * 1000;
        }
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
    // `topspeed` must be the CLASS's max warp, and the caller is the only one
    // that knows it. It is a required field so omitting it cannot silently
    // fall through to Prisma's `@default(0)`, which is how all 24 Cybertrons
    // in the round-4 galaxy ended up motionless.
    //
    // Zero is NOT rejected here, because zero is legal: canon ships the
    // Cybertron Base Star (class 23) with `S23WARP {Maximum Warp: 0}` and
    // `Maximum Acceleration: 0` — it is a fortress, immobile by design. A
    // `topspeed > 0` guard would have refused to spawn one. The invariant that
    // actually matters, "the slot carries this class's maxWarp", is asserted
    // where the slot is built (spawn-fill-timing.spec.ts).
    if (!Number.isInteger(slot.topspeed) || slot.topspeed < 0) {
      throw new Error(
        `Cybertron ${slot.userid}:${slot.shipno} (class ${slot.classNumber}) `
        + `spawned with topspeed ${slot.topspeed}.`,
      );
    }
    const cash = this.clampCybertronCash(BigInt(slot.loadout.gold));

    await this.prisma.$transaction(async (tx) => {
      // Upsert User row (may already exist from a previous spawn cycle)
      await tx.user.upsert({
        where: { userid: slot.userid },
        create: { userid: slot.userid, username: slot.userid, cash },
        update: { cash },
      });

      // Upsert Ship row — reuses the slot when a previous Cybertron with the
      // same userid/shipno died but its DB row wasn't deleted (P-007 in audit
      // 022 — TS doesn't delete-on-death like C's GEDELETE path).
      const shipData = {
        userid: slot.userid,
        shipno: slot.shipno,
        shipname: slot.shipname,
        shpclass: slot.classNumber,
        xcoord: slot.xcoord,
        ycoord: slot.ycoord,
        phasr: 100,
        phasrtype: slot.phasrtype,
        shieldtype: slot.shieldtype,
        topspeed: slot.topspeed,
        cybmine: 255,
        cybskill: slot.cybskill,
        tick: slot.tick,
        cybupdate: 100,
        holdcourse: 0,
        status: 2, // GESTAT_AUTO
        items: [
          0n,                              // I_MEN     = 0
          0n,                              // I_MISSL   = 1
          BigInt(slot.loadout.torpedo),    // I_TORP    = 2
          0n,                              // I_ION     = 3
          BigInt(slot.loadout.fluxpod),    // I_FLUX    = 4
          0n,                              // I_FOOD    = 5
          0n,                              // I_FIGHTER = 6
          BigInt(slot.loadout.decoys),     // I_DECOY   = 7
          0n,                              // I_TROOPS  = 8
          0n,                              // I_ZIPPER  = 9
          BigInt(slot.loadout.jammers),    // I_JAMMER  = 10
          BigInt(slot.loadout.mine),       // I_MINE    = 11
          BigInt(slot.loadout.gold),       // I_GOLD    = 12
          0n,                              // I_SPY     = 13
        ],
      };
      await tx.ship.upsert({
        where: { userid_shipno: { userid: slot.userid, shipno: slot.shipno } },
        create: shipData,
        update: {
          ...shipData,
          damage: 0,
          energy: 65000,
          speed: 0,
          speed2b: 0,
          heading: 0,
          head2b: 0,
          where: 0,
          shield: 0,
          shieldstat: 0,
          cloak: 0,
          jammer: 0,
          repair: 0,
          cantexit: 0,
          // A recycled slot inherits the previous occupant's countdown without
          // this, and destructTick acts on any value above zero — so a brand
          // new Cybertron detonates for something the ship before it did.
          // Canon assigns `destruct` nonzero in exactly one place, cmd_destruct
          // on the caller's OWN ship (GECMDS.C:5031), and zeroes it for every
          // new hull (GEFUNCS.C:256 initshp). An automaton never sets it.
          destruct: 0,
          lastfired: 0,
          lock: 0,
          ltorpsChannel: [255, 255, 255],
          ltorpsDistance: [0, 0, 0],
          lmisslChannel: [255, 255, 255],
          lmisslDistance: [0, 0, 0],
          lmisslEnergy: [0, 0, 0],
          decout: [],
          minesnear: 0,
          kills: 0,
          hostile: 0,
        },
      });
    });

    // Load the newly created ship into the in-memory map immediately so all
    // game logic can see it without waiting for server restart.
    const created = await this.prisma.ship.findUnique({
      where: { userid_shipno: { userid: slot.userid, shipno: slot.shipno } },
    });
    if (created) {
      const state = prismaShipToState(created as Parameters<typeof prismaShipToState>[0]);
      state.status = 2; // GESTAT_AUTO
      state.dirty = false;
      this.shipState.loadShip(state);
    }
  }

  /**
   * Immediately flush User rows to Postgres for significant-event durability.
   * Applies CYB_MAXCASH clamp to any /^Cybrg-/ userid.
   * @see specs/007-cybertron-ai/plan.md FR-019, R-11
   */
  /**
   * Credit accumulated allowance to Cybertron purses, clamped to CYB_MAXCASH.
   *
   * C credits `CYB_ALLOW` on every `cyb_lives` pass (GECYBS.C:229). Writing to
   * Postgres that often would be pointless chatter, so the tick service
   * accumulates in memory and hands the totals over on the spawn-slot cadence.
   * The increment is atomic and the clamp follows, so a concurrent kill
   * transfer cannot be lost.
   *
   * @see GECYBS.C:228-229  @see GECYBS.C:121-122
   */
  async creditAllowances(pending: ReadonlyMap<string, bigint>): Promise<void> {
    for (const [userid, amount] of pending) {
      if (amount <= 0n) continue;
      try {
        const updated = await this.prisma.user.update({
          where: { userid },
          data: { cash: { increment: amount } },
          select: { cash: true },
        });
        const clamped = this.clampCybertronCash(updated.cash);
        if (clamped !== updated.cash) {
          await this.prisma.user.update({ where: { userid }, data: { cash: clamped } });
        }
      } catch (err: unknown) {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`allowance credit failed for ${userid}: ${stack}`);
      }
    }
  }

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
   * Atomically increment a Cybertron ship's kill count by 1.
   * Used to track escalating difficulty per CYB_BE_NICE/CYB_BE_EASY thresholds.
   * @see GECYBS.C — kill counter used for CYB_BE_NICE/CYB_BE_EASY escalation
   */
  async incrementKills(shipno: number, userid: string): Promise<void> {
    try {
      await this.prisma.ship.update({
        where: { userid_shipno: { userid, shipno } },
        data: { kills: { increment: 1 } },
      });
    } catch (err: unknown) {
      // `${err}` on an unknown renders `[object Object]` for anything that is
      // not an Error, and a driver-adapter rejection is exactly that — the one
      // line recording a lost kill counter then says nothing about why.
      // @see issue #29
      const reason = err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err);
      this.logger.error(`incrementKills failed for ${userid}:${shipno}: ${reason}`);
    }
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
        if (!state || state.isEphemeral) continue;
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
