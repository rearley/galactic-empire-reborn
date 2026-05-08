import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult, CommandResultLine } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ITEM_NAMES, ITEM_TONS, NUMITEMS } from '../../constants/items';

const SHIELD_NAMES: Record<number, string> = {
  1: 'standard',
  2: 'regenerative',
  3: 'battle',
};

/**
 * Handles the `report` / `rep` command — multi-line ship status read-out.
 *
 * @see GECMDS.C:1946 cmd_report
 */
@Injectable()
export class ReportHandlerService implements OnModuleInit {
  private readonly logger = new Logger(ReportHandlerService.name);
  private readonly classCache = new Map<number, { typeName: string; hasCloak: boolean; maxTons: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const classes = await this.prisma.shipClass.findMany({
      select: { classNumber: true, typeName: true, hasCloak: true, maxTons: true },
    });
    for (const cls of classes) {
      this.classCache.set(cls.classNumber, {
        typeName: cls.typeName,
        hasCloak: cls.hasCloak,
        maxTons: cls.maxTons,
      });
    }
    this.logger.log(`Cached ${this.classCache.size} ship class type names`);
  }

  get command(): Command {
    return {
      keyword: 'report',
      aliases: ['rep'],
      minArgs: 1,
      argMissingMessage: formatMessage(MessageId.REPFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const sub = args[0]?.toLowerCase() ?? '';
    const cls = this.classCache.get(ship.shpclass);
    const typeName = cls?.typeName ?? `Class ${ship.shpclass}`;

    const lines: CommandResultLine[] = [];

    // Header: REP01 + DASHES
    lines.push({
      text: formatMessage(MessageId.REP01, typeName, ship.shipname),
      category: 'system',
    });
    lines.push({
      text: formatMessage(MessageId.DASHES),
      category: 'system',
    });

    if (sub === 'nav') {
      return { lines: [...lines, ...this.buildNav(ship)] };
    }

    if (sub === 'sys') {
      return { lines: [...lines, ...this.buildSys(ship, cls?.hasCloak ?? false)] };
    }

    if (sub === 'cargo') {
      let totalTons = 0;
      for (let i = 0; i < NUMITEMS; i++) {
        const qty = Number(ship.items[i] ?? 0n);
        if (qty <= 0) continue;
        const tons = qty * ITEM_TONS[i];
        totalTons += tons;
        lines.push({
          text: formatMessage(MessageId.REP_CARGO_LINE, qty, ITEM_NAMES[i]),
          category: 'info',
        });
      }
      if (totalTons === 0) {
        lines.push({ text: formatMessage(MessageId.REP_CARGO_NONE), category: 'info' });
      }
      const cap = cls?.maxTons ?? 0;
      lines.push({
        text: formatMessage(MessageId.REP_CARGO_TOTAL, Math.round(totalTons), cap),
        category: 'info',
      });
      return { lines };
    }

    if (sub === 'wpns') {
      lines.push({
        text: 'No weapons configured.',
        category: 'info',
        // TODO(006): expand wpns body when combat system is implemented
      });
      return { lines };
    }

    if (sub === 'acc') {
      return { lines: [...lines, ...await this.buildAcc(ship)] };
    }

    // Unknown sub-command
    return {
      lines: [{ text: formatMessage(MessageId.REPFMT), category: 'system' }],
    };
  }

  /** @see GECMDS.C:1967 nav section */
  private buildNav(ship: ShipState): CommandResultLine[] {
    const lines: CommandResultLine[] = [];
    lines.push({ text: formatMessage(MessageId.REP35), category: 'system' });

    // Compute approximate sector coords from float universe coords.
    // setsect() in C source maps float coords to integer sector grid.
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const xcord = Math.floor((ship.xcoord % 1) * 100);
    const ycord = Math.floor((ship.ycoord % 1) * 100);
    const heading = Math.round(ship.heading);
    const displaySpeed = ship.speed;
    const speedStr = displaySpeed === 0 ? 'stopped' : displaySpeed < 1000 ? 'impulse' : `warp ${(displaySpeed / 1000).toFixed(1)}`;

    if (ship.where === 1) {
      // Hyperspace
      lines.push({ text: formatMessage(MessageId.REP02, xsect, ysect), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP03, speedStr), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP04, heading), category: 'info' });
    } else if (ship.where === 0) {
      // Normal space
      lines.push({ text: formatMessage(MessageId.REP05, xsect, ysect), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP06, speedStr), category: 'info' });
      lines.push({ text: formatMessage(MessageId.REP07, heading), category: 'info' });
    } else if (ship.where >= 10) {
      // In orbit
      lines.push({
        text: formatMessage(MessageId.REP08, ship.where - 10, xsect, ysect),
        category: 'info',
      });
    }

    lines.push({
      text: formatMessage(MessageId.REP32, xsect, ysect, xcord, ycord),
      category: 'info',
    });

    return lines;
  }

  /** @see GECMDS.C:2007 sys section */
  private buildSys(ship: ShipState, hasCloak: boolean): CommandResultLine[] {
    const lines: CommandResultLine[] = [];
    const energy = Math.round(ship.energy);
    lines.push({ text: formatMessage(MessageId.REP09, energy), category: 'info' });

    if (ship.shieldtype > 0) {
      const shieldName = SHIELD_NAMES[ship.shieldtype] ?? `type ${ship.shieldtype}`;
      if (ship.shieldstat === 1) {
        // SHIELDUP
        lines.push({ text: formatMessage(MessageId.REP10, shieldName, 100), category: 'info' });
      } else {
        lines.push({ text: formatMessage(MessageId.REP11), category: 'info' });
      }
    }

    if (ship.phasrtype > 0) {
      if (ship.phasr > 0) {
        lines.push({ text: formatMessage(MessageId.REP23, ship.phasrtype), category: 'info' });
      } else {
        lines.push({ text: formatMessage(MessageId.REP24, ship.phasrtype), category: 'info' });
      }
    }

    lines.push({
      text: formatMessage(
        MessageId.REP24A,
        ship.freq[0] ?? 0,
        ship.freq[1] ?? 0,
        ship.freq[2] ?? 0,
      ),
      category: 'info',
    });

    if (hasCloak) {
      if (ship.cloak > 0) {
        lines.push({ text: formatMessage(MessageId.REP12), category: 'info' });
      } else {
        lines.push({ text: formatMessage(MessageId.REP13), category: 'info' });
      }
    }

    const damageStr = ship.damage > 0 ? `${Math.round(ship.damage)}% hull damage` : 'none';
    lines.push({ text: formatMessage(MessageId.REP14, damageStr), category: 'info' });

    return lines;
  }

  /** @see GECMDS.C:2074 acc section */
  private async buildAcc(ship: ShipState): Promise<CommandResultLine[]> {
    const lines: CommandResultLine[] = [];
    lines.push({ text: formatMessage(MessageId.REP25), category: 'system' });

    const user = await this.prisma.user.findUnique({
      where: { userid: ship.userid },
      select: { cash: true, score: true, kills: true, planets: true, teamcode: true },
    });

    if (!user) return lines;

    if (user.planets === 0) {
      lines.push({ text: formatMessage(MessageId.REP26), category: 'info' });
    } else {
      lines.push({ text: formatMessage(MessageId.REP27, user.planets), category: 'info' });
    }

    lines.push({ text: formatMessage(MessageId.REP28, user.cash.toLocaleString()), category: 'info' });

    const score = user.score <= 0n ? '0' : user.score.toLocaleString();
    lines.push({ text: formatMessage(MessageId.REP30, score), category: 'info' });

    lines.push({ text: formatMessage(MessageId.REP31, user.kills), category: 'info' });

    if (user.teamcode && user.teamcode > 0n) {
      const team = await this.prisma.team.findUnique({
        where: { teamcode: user.teamcode },
        select: { teamname: true },
      });
      if (team) {
        lines.push({ text: formatMessage(MessageId.REP31A, team.teamname), category: 'info' });
      }
    }

    return lines;
  }
}
