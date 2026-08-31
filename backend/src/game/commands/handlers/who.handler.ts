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
/** Fixed column widths shared by the `who` header and its rows. */
const NAME_W = 22;
const CLASS_W = 20;
/** Wide enough for "(-13,-14)". */
const SECTOR_W = 9;
const KILLS_W = 5;

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
    // Header and rows share these widths so the columns cannot drift apart —
    // they had, because coordinates were padded to two characters and a ship in
    // a negative double-digit sector ("(-13, 1)") shifted everything after it.
    const header =
      ` ${'Shipname'.padEnd(NAME_W)} ${'Class'.padEnd(CLASS_W)} ${'Sector'.padEnd(SECTOR_W)}  ${'Kills'.padStart(KILLS_W)}`;
    const lines: CommandResult['lines'] = [{ text: header, category: 'system' }];

    const active = this.shipService
      .findAllShips()
      .filter((s) => !s.cloak)
      .sort((a, b) => a.shipname.toLowerCase().localeCompare(b.shipname.toLowerCase()));

    for (const s of active) {
      const name = s.shipname.padEnd(NAME_W).slice(0, NAME_W);
      const cls = (this.classNames.get(s.shpclass) ?? `Class ${s.shpclass}`).padEnd(CLASS_W).slice(0, CLASS_W);
      const xs = Math.floor(s.xcoord).toString().padStart(3);
      const ys = Math.floor(s.ycoord).toString().padStart(3);
      const sector = `(${xs},${ys})`.padEnd(SECTOR_W).slice(0, SECTOR_W);
      const kills = s.kills.toString().padStart(KILLS_W);
      lines.push({ text: ` ${name} ${cls} ${sector}  ${kills}`, category: 'info' });
    }

    return { lines };
  }
}
