import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { ENGYMAX } from '../../constants';
import { START_FLUX_PODS } from '../../constants/onboarding';
import { prismaShipToState } from '../../ship/ship-state.mappers';

/**
 * Phaser/shield prices indexed by type-1 (type 1 = index 0).
 * @see GEMAIN.C phaserprice[], shieldprice[]
 */
const PHASER_PRICE = [5_000n, 10_000n, 40_000n, 100_000n, 220_000n, 400_000n, 650_000n, 900_000n,
  1_200_000n, 2_000_000n, 3_800_000n, 5_000_000n, 7_000_000n, 9_000_000n,
  15_000_000n, 30_000_000n, 60_000_000n, 100_000_000n, 200_000_000n];
const SHIELD_PRICE = [5_000n, 10_000n, 40_000n, 100_000n, 250_000n, 500_000n, 750_000n, 1_100_000n,
  1_500_000n, 2_500_000n, 4_000_000n, 6_000_000n, 8_000_000n, 10_000_000n,
  30_000_000n, 50_000_000n, 80_000_000n, 120_000_000n, 250_000_000n];

/** Net cost to move from currentType to newType, accounting for 2/3 trade-in. @see GECMDS.C:4664 */
function upgradeCost(priceTable: bigint[], currentType: number, newType: number): { cost: bigint; credit: bigint } {
  const tradeIn = currentType > 0 ? priceTable[currentType - 1] - priceTable[currentType - 1] / 3n : 0n;
  const delta = priceTable[newType - 1] - tradeIn;
  if (delta < 0n) {
    const raw = -delta;
    const fee = raw / 50n; // 2% fee on downgrade refund — GECMDS.C:4618
    return { cost: 0n, credit: raw - fee };
  }
  return { cost: delta < 1_000n ? 1_000n : delta, credit: 0n }; // min 1000 fee — GECMDS.C:4628
}

/**
 * Handles the `new` command — purchase a ship or upgrade phasers/shields at Zygor station.
 * @see GECMDS.C:cmd_new
 */
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
      where: { category: 'PLAYER' },
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

    if (!shipClass || shipClass.category !== 'PLAYER') {
      return {
        lines: [{ text: "Invalid ship class. Type 'new ship' to see available classes.", category: 'system' }],
      };
    }

    // Validate: sufficient credits
    const userRow = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true },
    });

    const cash = userRow?.cash ?? 0n;
    if (cash < shipClass.maxPrice) {
      return {
        lines: [{
          text: `Insufficient credits. You need ${shipClass.maxPrice.toLocaleString()} cr but have ${cash.toLocaleString()} cr.`,
          category: 'system',
        }],
      };
    }

    // Determine next ship number for this user
    const existingCount = await this.prisma.ship.count({ where: { userid: ship.userid } });
    const newShipno = existingCount + 1;
    const shipName = `${shipClass.typeName} #${newShipno}`;

    // items[I_FLUX=4] = START_FLUX_PODS; 14 slots per NUMITEMS=14
    const items: bigint[] = [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

    const created = await this.prisma.ship.create({
      data: {
        userid: ship.userid,
        shipno: newShipno,
        shipname: shipName,
        shpclass: classNumber,
        xcoord: Math.floor(ship.xcoord),
        ycoord: Math.floor(ship.ycoord),
        energy: ENGYMAX,
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
    });

    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: { decrement: shipClass.maxPrice } },
    });

    const state = prismaShipToState(created);
    this.shipStateService.loadShip(state);

    const remaining = cash - shipClass.maxPrice;
    return {
      lines: [{
        text: `New ${shipClass.typeName} purchased. Credits remaining: ${remaining.toLocaleString()}. Board her with \`boa ${newShipno}\`.`,
        category: 'success',
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
        const { cost, credit } = upgradeCost(priceTable, currentType, t);
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

    const { cost, credit } = upgradeCost(priceTable, currentType, newType);

    if (cost > 0n && cash < cost) {
      return { lines: [{ text: `Insufficient credits. Need ${cost.toLocaleString()} cr, have ${cash.toLocaleString()} cr.`, category: 'system' }] };
    }

    // Apply — update DB and mutate in-memory state
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { cash: cost > 0n ? { decrement: cost } : { increment: credit } },
    });

    this.shipStateService.mutate(ship.userid, ship.shipno, (s) => {
      if (kind === 'phaser') s.phasrtype = newType;
      else s.shieldtype = newType;
      s.dirty = true;
    });

    const newCash = cost > 0n ? cash - cost : cash + credit;
    const action = credit > 0n ? `Refund: ${credit.toLocaleString()} cr.` : `Cost: ${cost.toLocaleString()} cr.`;
    return {
      lines: [{ text: `${kind === 'phaser' ? 'Phaser' : 'Shield'} upgraded to type ${newType}. ${action} Credits: ${newCash.toLocaleString()} cr.`, category: 'success' }],
    };
  }
}
