import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult, ScanCell } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT, projectRangeCell } from '../../constants';

/**
 * Handles the `scan` / `sc` command family.
 * `scan lo` (and bare `scan`) produce both text lines and a scanGrid payload.
 * `scan sh` and `scan pl` produce text-only responses.
 *
 * @see GECMDS.C:2138 cmd_scan
 * @see GECMDS.C:2640 scan_lo (range-centred tactical projection)
 * @see GECMDS.C:2190 scan_sh
 * @see GECMDS.C:2295 scan_pl
 */
@Injectable()
export class ScanHandlerService implements OnModuleInit {
  private readonly logger = new Logger(ScanHandlerService.name);
  private readonly classCache = new Map<number, { scanRange: number }>();

  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const classes = await this.prisma.shipClass.findMany({
      select: { classNumber: true, scanRange: true },
    });
    for (const cls of classes) {
      this.classCache.set(cls.classNumber, { scanRange: cls.scanRange });
    }
    this.logger.log(`Cached ${this.classCache.size} ship class scan ranges`);
  }

  get command(): Command {
    return {
      keyword: 'scan',
      aliases: ['sc'],
      minArgs: 0,
      argMissingMessage: formatMessage(MessageId.SCANFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): CommandResult =>
        this.handle(ship, args, ctx),
    };
  }

  private handle(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    // TODO(006): see GECMDS.C:2143 — tactical-computer gate (TABROKE)
    // TODO(006): see GECMDS.C:2150 — jammer gate (JAMMER4)

    const sub = args[0]?.toLowerCase() ?? 'lo';

    if (sub === 'lo') {
      return this.scanLo(ship);
    }

    if (sub === 'sh') {
      return this.scanSh(ship, args.slice(1));
    }

    if (sub === 'pl') {
      return this.scanPl(_ctx, args.slice(1));
    }

    // scan ra, scan se — out of scope for feature 003
    if (sub === 'ra' || sub === 'se') {
      return {
        lines: [{ text: formatMessage(MessageId.SCANFMT), category: 'system' }],
      };
    }

    return {
      lines: [{ text: formatMessage(MessageId.SCANFMT), category: 'system' }],
    };
  }

  /**
   * Range-centred tactical scan producing a scanGrid payload.
   * @see GECMDS.C:2640 scan_lo
   */
  private scanLo(ship: ShipState): CommandResult {
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    const grid: ScanCell[] = [];

    // Project all in-memory ships onto the grid
    for (const other of this.shipService.findAllShips()) {
      if (other.userid === ship.userid && other.shipno === ship.shipno) continue;

      const cell = projectRangeCell(ship, other, scanRange);
      if (!cell) continue;

      // GECMDS.C:2710-2715: status==GESTAT_AUTO → '+', else '='
      // GESTAT_AUTO = 1 per original source (assumed — TODO: verify from GEMAIN.H)
      const char = other.status === 1 ? '+' : '=';
      grid.push({ x: cell.x, y: cell.y, type: 'ship', char });
    }

    // TODO(004): project planets from Prisma when galaxy generator is implemented
    // TODO(004): project wormholes from Prisma when galaxy generator is implemented

    // Self-cell always included — GECMDS.C:2721 map[MAXY/2][MAXX/2] = '*'
    grid.push({
      x: Math.floor(SCAN_GRID_WIDTH / 2),
      y: Math.floor(SCAN_GRID_HEIGHT / 2),
      type: 'self',
      char: '*',
    });

    return {
      lines: [{ text: `Scanning sector...`, category: 'info' }],
      scanGrid: grid,
    };
  }

  /**
   * Text-only scan of a named ship — no scanGrid field.
   * @see GECMDS.C:2190 scan_sh
   */
  private scanSh(ship: ShipState, args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        lines: [{ text: formatMessage(MessageId.SCANFMT), category: 'system' }],
      };
    }
    const name = args.join(' ');
    const target = this.shipService.findByName(name);
    if (!target) {
      return {
        lines: [{ text: `No ship named "${name}" found.`, category: 'system' }],
      };
    }
    const dist = Math.sqrt(
      Math.pow(target.xcoord - ship.xcoord, 2) + Math.pow(target.ycoord - ship.ycoord, 2),
    );
    // TODO(006): compute bearing properly from GEFUNCS.C
    const bearing = 0;
    const ltr = target.status === 1 ? '+' : '=';
    return {
      lines: [
        {
          text: `${ltr} ${target.shipname} — class ${target.shpclass}, range ${dist.toFixed(1)}, bearing ${bearing}.`,
          category: 'info',
        },
      ],
      // No scanGrid — scan_sh is text-only per contracts/websocket-events.md
    };
  }

  /**
   * Text-only scan of a named planet — no scanGrid field.
   * @see GECMDS.C:2295 scan_pl
   */
  private scanPl(_ctx: CommandContext, args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        lines: [{ text: formatMessage(MessageId.SCANFMT), category: 'system' }],
      };
    }
    // TODO(004): query planets from Prisma when galaxy generator is implemented
    return {
      lines: [{ text: 'No planets found in range.', category: 'info' }],
    };
  }
}
