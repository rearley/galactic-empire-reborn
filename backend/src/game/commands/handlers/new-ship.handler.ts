import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { ENGYMAX } from '../../constants';
import { START_FLUX_PODS } from '../../constants/onboarding';
import { prismaShipToState } from '../../ship/ship-state.mappers';

/**
 * Handles the `new` command — purchase a ship at Zygor station (neutral zone, sector 0,0).
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
      argMissingMessage: "USAGE: new ship <class>  — purchase a ship at Zygor station",
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      return {
        lines: [{ text: "USAGE: new ship <class>  — purchase a ship at Zygor station", category: 'system' }],
      };
    }

    if (sub === 'shield') {
      return {
        lines: [{ text: "Shield upgrades are not yet available. Check back in a future update.", category: 'system' }],
      };
    }

    if (sub !== 'ship') {
      return {
        lines: [{ text: "USAGE: new ship <class>  — purchase a ship at Zygor station", category: 'system' }],
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
}
