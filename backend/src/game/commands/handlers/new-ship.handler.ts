import { Injectable } from '@nestjs/common';
import { buildPurchasedShipName } from './purchased-ship-name';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { ENGYMAX, MAXSHIPS, GESTAT_AVAIL } from '../../constants';
import { START_FLUX_PODS } from '../../constants/onboarding';
import { formatMessage, MessageId } from '../messages';

/**
 * Phaser/shield prices indexed by type-1 (type 1 = index 0).
 *
 * These are SYSOP OPTIONS, not compiled constants:
 * `shieldprice[i] = lngopt(SHLDPR01+i,0L,201228378L)` and the PHSRPR01+i
 * equivalent, GEMAIN.C:575-591. The literal arrays at GEMAIN.C:299-341 look
 * authoritative and are not -- they sit inside an `OMITTED 3.2c.7` comment
 * block and are dead code, which is how SHLDPR19 came to read 250,000,000 here
 * against a shipped 200,000,000.
 *
 * Defaults live in GE/REL/MBMGEMSG.MSG:1664-1812 and are pinned field by field
 * by test/balance/upgrade-prices-canon.balance.spec.ts.
 *
 * @see GEMAIN.C:575-591, reference/ge-upstream/PROVENANCE.md
 */
/**
 * cyb_class — the index of the first CYBORG entry, which bounds what `new ship`
 * may list or sell. GEMAIN.C:881-882 computes it; in the shipped table the
 * first CYBORG is class 21.
 */
const FIRST_CPU_CLASS = 21;

export const PHASER_PRICE = [5_000n, 10_000n, 40_000n, 100_000n, 220_000n, 400_000n, 650_000n, 900_000n,
  1_200_000n, 2_000_000n, 3_800_000n, 5_000_000n, 7_000_000n, 9_000_000n,
  15_000_000n, 30_000_000n, 60_000_000n, 100_000_000n, 200_000_000n];
export const SHIELD_PRICE = [5_000n, 10_000n, 40_000n, 100_000n, 250_000n, 500_000n, 750_000n, 1_100_000n,
  1_500_000n, 2_500_000n, 4_000_000n, 6_000_000n, 8_000_000n, 10_000_000n,
  30_000_000n, 50_000_000n, 80_000_000n, 120_000_000n, 200_000_000n];

/** The Yardmaster's quote for swapping one phaser/shield for another. */
export interface UpgradeQuote {
  /** What the yard allows for the unit being removed: price - price/3. */
  tradeIn: bigint;
  /** Credits charged for the fitting (0 on a downgrade). */
  cost: bigint;
  /** Credits deposited back on a downgrade, net of the fee (0 otherwise). */
  credit: bigint;
  /** Transaction fee withheld from a downgrade refund: credit/50. */
  fee: bigint;
  /** True when the net cost was under 1000 and the minimum charge applied. */
  minCharge: boolean;
}

/**
 * Prices an upgrade exactly as the C does, in integer arithmetic.
 *
 * delta = newprice - (oldprice - oldprice/3); a negative delta becomes a
 * refund less a credit/50 transaction fee, and a positive delta under 1000 is
 * rounded up to the 1000 C minimum install charge.
 *
 * @see GECMDS.C:4664-4693 (phaser), :4602-4631 (shield)
 */
export function quoteUpgrade(priceTable: bigint[], currentType: number, newType: number): UpgradeQuote {
  // C guards the trade-in with `if (delta > 0) ... else delta = 0`.
  let tradeIn = currentType > 0 ? priceTable[currentType - 1] - priceTable[currentType - 1] / 3n : 0n;
  if (tradeIn < 0n) tradeIn = 0n;

  let delta = priceTable[newType - 1] - tradeIn;
  let credit = 0n;
  let fee = 0n;
  let minCharge = false;

  if (delta < 0n) {
    credit = -delta;
    fee = credit / 50n;
    credit = credit - fee;
    if (credit < 0n) credit = 0n;
    delta = 0n;
  }

  if (delta < 1_000n && delta > 0n) {
    minCharge = true;
    delta = 1_000n;
  }

  return { tradeIn, cost: delta, credit, fee, minCharge };
}

/**
 * Handles the `new` command — purchase a ship or upgrade phasers/shields at Zygor station.
 * @see GECMDS.C:cmd_new
 */

/** Distinct generated names tried before giving up on a purchase. */
const SHIPNAME_ATTEMPTS = 5;

/** True for a Prisma unique-constraint violation on the ship name. */
function isShipnameCollision(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code?: string }).code !== 'P2002') return false;
  const target = (err as { meta?: { target?: string | string[] } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return fields.toLowerCase().includes('shipname');
}

@Injectable()
export class NewShipHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipStateService: ShipStateService,
  ) {}

  get command(): Command {
    return {
      keyword: 'new',
      aliases: [],
      minArgs: 0,
      argMissingMessage: "USAGE: new ship <class> | new phaser <type> | new shield <type>",
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      return {
        lines: [{ text: "USAGE: new ship <class> | new phaser <type> | new shield <type>", category: 'system' }],
      };
    }

    if (sub === 'phaser') return this.handleUpgrade(ship, args[1], 'phaser');
    if (sub === 'shield') return this.handleUpgrade(ship, args[1], 'shield');

    if (sub !== 'ship') {
      return {
        lines: [{ text: "USAGE: new ship <class> | new phaser <type> | new shield <type>", category: 'system' }],
      };
    }

    const classArg = args[1];

    if (!classArg) {
      return this.listClasses();
    }

    return this.purchaseShip(ship, classArg);
  }

  private async listClasses(): Promise<CommandResult> {
    const classes = await this.prisma.shipClass.findMany({
      // C bounds BOTH the listing and the purchase at cyb_class — the index of
      // the first CYBORG class, which is 21 (GECMDS.C:378 `for (i=0;i<cyb_class;++i)`
      // and :4562-4566 `type >= 0 && type < cyb_class && ... == CLASSTYPE_USER`).
      // Filtering on category alone let the Sysopian Death Star (class 41,
      // 32M credits, warp 255, 100M tons) be advertised to every pilot from day
      // one and bought by anyone rich enough. It is admin-only in the original
      // and unreachable through this command.
      where: { category: 'PLAYER', classNumber: { lt: FIRST_CPU_CLASS } },
      orderBy: { classNumber: 'asc' },
    });

    const lines = [
      { text: 'Available ships at Zygor station:', category: 'system' as const },
      ...classes.map((c) => ({
        text: `  ${c.classNumber.toString().padEnd(3)} ${c.typeName.padEnd(20)}  ${c.maxPrice.toLocaleString()} cr`,
        category: 'system' as const,
      })),
    ];

    return { lines };
  }

  private async purchaseShip(ship: ShipState, classArg: string): Promise<CommandResult> {
    // Validate: must be in neutral zone (sector 0,0)
    if (Math.floor(ship.xcoord) !== 0 || Math.floor(ship.ycoord) !== 0) {
      return {
        lines: [{ text: "You must be at Zygor station (neutral zone) to purchase a ship.", category: 'system' }],
      };
    }

    // Validate: must be orbiting
    if (ship.where < 10) {
      return {
        lines: [{ text: "You must be orbiting a planet at Zygor station.", category: 'system' }],
      };
    }

    const classNumber = parseInt(classArg, 10);
    if (isNaN(classNumber)) {
      return {
        lines: [{ text: "Invalid ship class. Type 'new ship' to see available classes.", category: 'system' }],
      };
    }

    // Validate: class must exist and be PLAYER category
    const shipClass = await this.prisma.shipClass.findFirst({
      where: { classNumber },
    });

    if (!shipClass || shipClass.category !== 'PLAYER' || shipClass.classNumber >= FIRST_CPU_CLASS) {
      return {
        lines: [{ text: "Invalid ship class. Type 'new ship' to see available classes.", category: 'system' }],
      };
    }

    // Fetch user state (cash + fleet counters)
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true, noships: true, topshipno: true },
    });

    const cash = userRow?.cash ?? 0n;
    const noships = userRow?.noships ?? 0;
    const topshipno = userRow?.topshipno ?? 0;

    // Validate: fleet cap (@see GEMAIN.C MAXSHIPS)
    if (noships >= MAXSHIPS) {
      return { lines: [{ text: formatMessage(MessageId.NEW_FLEET_FULL), category: 'system' }] };
    }

    // Validate: sufficient credits
    if (cash < shipClass.maxPrice) {
      return {
        lines: [{
          text: `Insufficient credits. You need ${shipClass.maxPrice.toLocaleString()} cr but have ${cash.toLocaleString()} cr.`,
          category: 'system',
        }],
      };
    }

    // Allocate monotonic ship number — never reuse after deletion
    const newShipno = topshipno + 1;

    // items[I_FLUX=4] = START_FLUX_PODS; 14 slots per NUMITEMS=14
    const items: bigint[] = [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

    // Atomic: create dormant ship + update user fleet counters and cash.
    //
    // Retried on a shipname collision: the generated name carries the captain's
    // OWN ship number while `Ship_shipname_lower_idx` is global, so two captains
    // buying their second hull of a class produce the same name. The P2002 used
    // to escape as "Internal error processing command." and cost the player the
    // purchase. Mirrors TeamService.create, which retries name collisions the
    // same way.
    let shipName = '';
    let created = false;
    for (let attempt = 0; attempt < SHIPNAME_ATTEMPTS && !created; attempt++) {
      shipName = buildPurchasedShipName(shipClass.typeName, newShipno, attempt, ship.userid);
      try {
        await this.createShipTransaction(
          ship.userid, newShipno, shipName, classNumber, shipClass, items,
          // The buyer's exact position, not the sector index. Flooring put a
          // hull "docked at Zygor" at the sector's corner instead — up to
          // 7,071 units from the station, which since orbit began requiring a
          // 250-unit approach is a long impulse crawl back to where you
          // already were.
          { x: ship.xcoord, y: ship.ycoord },
        );
        created = true;
      } catch (err: unknown) {
        if (!isShipnameCollision(err)) throw err;
      }
    }

    if (!created) {
      return {
        lines: [{
          text: 'Could not find an unused name for the new ship. Try again.',
          category: 'system',
        }],
      };
    }

    // Dormant ship is NOT loaded into in-memory ShipStateService — reconnect to fly her (login-only switching)

    const remaining = cash - shipClass.maxPrice;
    return {
      lines: [{
        text: `New ${shipClass.typeName} purchased and docked at Zygor. Reconnect to fly her. Credits remaining: ${remaining.toLocaleString()}.`,
        category: 'system',
      }],
    };
  }

  private async handleUpgrade(ship: ShipState, typeArg: string | undefined, kind: 'phaser' | 'shield'): Promise<CommandResult> {
    const priceTable = kind === 'phaser' ? PHASER_PRICE : SHIELD_PRICE;
    const currentType = kind === 'phaser' ? ship.phasrtype : ship.shieldtype;

    const shipClass = await this.prisma.shipClass.findFirst({ where: { classNumber: ship.shpclass } });
    const classMax = kind === 'phaser' ? (shipClass?.maxPhaser ?? 0) : (shipClass?.maxShields ?? 0);

    // No type arg — show price list
    if (!typeArg) {
      const lines: CommandResult['lines'] = [
        { text: `${kind === 'phaser' ? 'Phaser' : 'Shield'} upgrades — current type: ${currentType}  class max: ${classMax}`, category: 'system' },
        { text: '  Type  List price    Net cost (after trade-in)', category: 'system' },
        { text: '  ----  ----------    -------------------------', category: 'system' },
      ];
      for (let t = 1; t <= classMax; t++) {
        const { cost, credit } = quoteUpgrade(priceTable, currentType, t);
        const marker = t === currentType ? ' ◄' : '';
        const costStr = credit > 0n ? `-${credit.toLocaleString()} cr (refund)` : `${cost.toLocaleString()} cr`;
        lines.push({
          text: `  ${t.toString().padEnd(4)}  ${priceTable[t - 1].toLocaleString().padEnd(12)}  ${costStr}${marker}`,
          category: t === currentType ? 'success' : 'info',
        });
      }
      lines.push({ text: `  Usage: new ${kind} <type>`, category: 'system' });
      return { lines };
    }

    const newType = parseInt(typeArg, 10);
    if (isNaN(newType) || newType < 1 || newType > 19) {
      return { lines: [{ text: `Invalid type. Type 'new ${kind}' to see available upgrades.`, category: 'system' }] };
    }
    if (newType > classMax) {
      return { lines: [{ text: `Your ship class cannot exceed ${kind} type ${classMax}.`, category: 'system' }] };
    }
    if (newType === currentType) {
      return { lines: [{ text: `You already have ${kind} type ${currentType}.`, category: 'system' }] };
    }

    // Must be at Zygor-3 and orbiting — GECMDS.C:4561
    if (Math.floor(ship.xcoord) !== 0 || Math.floor(ship.ycoord) !== 0) {
      return { lines: [{ text: 'You must be at Zygor station (neutral zone) to purchase upgrades.', category: 'system' }] };
    }
    if (ship.where < 10) {
      return { lines: [{ text: 'You must be orbiting a planet at Zygor station.', category: 'system' }] };
    }

    const userRow = await this.prisma.user.findUnique({ where: { userid: ship.userid }, select: { cash: true } });
    const cash = userRow?.cash ?? 0n;

    const quote = quoteUpgrade(priceTable, currentType, newType);
    const lines: CommandResult['lines'] = [];

    // Canon narrates the transaction in order, and the trade-in quote comes
    // FIRST — it is what makes a Mark-3 phaser cost 36,666 rather than its
    // 40,000 list price. The port printed neither line, only an invented
    // "Phaser upgraded to type 3. Cost: ... Credits: ..." stat line, so the
    // player could not tell where the price came from.
    // @see GECMDS.C:4666-4670 (NEW29), :4604-4608 (NEW19)
    if (quote.tradeIn > 0n) {
      lines.push({
        text: formatMessage(
          kind === 'phaser' ? MessageId.NEW29 : MessageId.NEW19,
          quote.tradeIn.toLocaleString(),
        ),
        category: 'info',
      });
    }

    // Downgrade: the yard owes us the difference, less a credit/50 fee.
    // @see GECMDS.C:4676-4686 (NEW28), :4614-4624 (NEW18)
    if (quote.credit > 0n) {
      lines.push({
        text: formatMessage(
          kind === 'phaser' ? MessageId.NEW28 : MessageId.NEW18,
          quote.fee.toLocaleString(),
          quote.credit.toLocaleString(),
        ),
        category: 'info',
      });
    }

    // The 1000 C floor on an install. @see GECMDS.C:4688-4693 (NEW17)
    if (quote.minCharge) {
      lines.push({ text: formatMessage(MessageId.NEW17), category: 'info' });
    }

    // C tests `delta <= cash` AFTER printing the trade-in, so a captain who
    // cannot afford the fitting still hears what the old unit was worth.
    if (quote.cost > cash) {
      lines.push({
        text: `Insufficient credits. Need ${quote.cost.toLocaleString()} cr, have ${cash.toLocaleString()} cr.`,
        category: 'system',
      });
      return { lines };
    }

    // Apply — update DB and mutate in-memory state
    if (quote.cost > 0n || quote.credit > 0n) {
      await this.prisma.user.update({
        where: { userid: ship.userid },
        data: { cash: quote.cost > 0n ? { decrement: quote.cost } : { increment: quote.credit } },
      });
    }

    this.shipStateService.mutate(ship.userid, ship.shipno, (s) => {
      if (kind === 'phaser') s.phasrtype = newType;
      else s.shieldtype = newType;
      s.dirty = true;
    });

    // The Yardmaster's fitting report, last.
    // @see GECMDS.C:4701 (NEW10), :4640 (NEW7)
    lines.push({
      text: formatMessage(
        kind === 'phaser' ? MessageId.NEW10 : MessageId.NEW7,
        quote.cost.toLocaleString(),
        newType,
      ),
      category: 'success',
    });

    return { lines };
  }

  /**
   * Creates the dormant hull and debits the captain in one transaction.
   * Split out so the caller can retry it under a different name.
   */
  private async createShipTransaction(
    userid: string,
    shipno: number,
    shipname: string,
    classNumber: number,
    shipClass: { maxPrice: bigint; maxWarp: number },
    items: bigint[],
    at: { x: number; y: number },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.ship.create({
        data: {
          userid,
          shipno,
          shipname,
          shpclass: classNumber,
          status: GESTAT_AVAIL,
          xcoord: at.x,
          ycoord: at.y,
          energy: ENGYMAX,
          // C's `new ship` runs the same initshp as a first-time pilot's hull
          // (GECMDS.C:4572), which fits basic phasers and shields:
          // `shieldtype = 1; phasrtype = 1` (GEFUNCS.C:233-234). Leaving these
          // at the column default of 0 shipped a hull with no weapons and no
          // shields — `shi up` answered "You have no shields installed" — while
          // `rep wpns` and the upgrade screens made "type 0" look intentional.
          phasrtype: 1,
          shieldtype: 1,
          // Engine ceiling for the class. Only ever ratcheted DOWN afterwards,
          // by engine damage — so leaving it at the column default of 0 was
          // indistinguishable from blown engines and `war` refused with
          // WARPSPD2 forever. Onboarding has always set this; this second
          // creation path did not. @see onboarding.service.ts
          topspeed: shipClass.maxWarp,
          phasr: 100,
          shield: 0,
          ltorpsChannel: [],
          ltorpsDistance: [],
          lmisslChannel: [],
          lmisslDistance: [],
          lmisslEnergy: [],
          decout: [],
          freq: [0, 0, 0],
          items,
        } as never,
      }),
      this.prisma.user.update({
        where: { userid },
        data: {
          cash: { decrement: shipClass.maxPrice },
          noships: { increment: 1 },
          topshipno: shipno,
        },
      }),
    ]);
  }
}
