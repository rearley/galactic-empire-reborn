import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles `who` — lists all active non-cloaked ships sorted by shipname ascending.
 * Reinterpretation of cmd_who (GECMDS.C:5162) as a player-facing roster listing.
 * @see GECMDS.C:5162 cmd_who
 * @see specs/012-social-commands/research.md D1
 */
@Injectable()
export class WhoHandlerService implements OnModuleInit {
  private readonly classNames = new Map<number, string>();

  constructor(
    private readonly shipService: ShipStateService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.prisma) return;
    const rows = await this.prisma.shipClass.findMany({ select: { classNumber: true, typeName: true } });
    for (const r of rows) this.classNames.set(r.classNumber, r.typeName);
  }

  get command(): Command {
    return {
      keyword: 'who',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult =>
        this.handle(ship),
    };
  }

  private handle(_ship: ShipState): CommandResult {
    const header = '  Shipname               Class                Sector  Kills';
    const lines: CommandResult['lines'] = [{ text: header, category: 'system' }];

    const active = this.shipService
      .findAllShips()
      .filter((s) => !s.cloak)
      .sort((a, b) => a.shipname.toLowerCase().localeCompare(b.shipname.toLowerCase()));

    for (const s of active) {
      const name = s.shipname.padEnd(22).slice(0, 22);
      const cls = (this.classNames.get(s.shpclass) ?? `Class ${s.shpclass}`).padEnd(20).slice(0, 20);
      const xs = Math.floor(s.xcoord).toString().padStart(2);
      const ys = Math.floor(s.ycoord).toString().padStart(2);
      const kills = s.kills.toString().padStart(5);
      lines.push({ text: ` ${name} ${cls} (${xs},${ys})  ${kills}`, category: 'info' });
    }

    return { lines };
  }
}
