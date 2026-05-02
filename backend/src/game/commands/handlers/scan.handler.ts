import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { Command, CommandContext, CommandResult, ScanCell } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT, projectRangeCell } from '../../constants';

/** Environment string table indexed by `enviorn` (0..3). @see GECMDS.C:2338-2349 */
const ENV_STRINGS = [
  MessageId.SCAN12, // 0 — Earth-like
  MessageId.SCAN13, // 1 — Hostile
  MessageId.SCAN14, // 2 — Toxic
  MessageId.SCAN15, // 3 — Inferno-like
] as const;

/** Resource string table indexed by `resource` (0..3). @see GECMDS.C:2351-2356 */
const RES_STRINGS = [
  MessageId.SCAN12, // 0 — Barren (reuse Earth-like slot per original table-driven approach)
  MessageId.SCAN13, // 1 — Sparse
  MessageId.SCAN14, // 2 — Rich
  MessageId.SCAN15, // 3 — Abundant
] as const;

// Resource display strings (the original uses separate text for resources vs environment)
const RES_DISPLAY: Record<number, string> = {
  0: 'Barren',
  1: 'Sparse',
  2: 'Rich',
  3: 'Abundant',
};

/**
 * Handles the `scan` / `sc` command family.
 * `scan lo` (and bare `scan`) produce both text lines and a scanGrid payload.
 * `scan sh` and `scan pl` produce text-only responses.
 *
 * @see GECMDS.C:2138 cmd_scan
 * @see GECMDS.C:2640 scan_lo (range-centred tactical projection)
 * @see GECMDS.C:2190 scan_sh
 * @see GECMDS.C:2295 scan_pl (deviation: named lookup — research.md Decision 8)
 */
@Injectable()
export class ScanHandlerService implements OnModuleInit {
  private readonly logger = new Logger(ScanHandlerService.name);
  private readonly classCache = new Map<number, { scanRange: number }>();

  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly galaxyService: GalaxyService,
    private readonly planetService: PlanetStateService,
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
      return this.scanPl(ship, args.slice(1));
    }

    // scan ra, scan se — out of scope for feature 003/004
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
   * Projection order per contracts/scan-projection.md:
   *   1. All in-range ships (excluding self)
   *   2. All planets in player's current sector
   *   3. All visible wormholes in player's current sector
   *   4. Self-cell
   *
   * @see GECMDS.C:2640 scan_lo
   */
  private scanLo(ship: ShipState): CommandResult {
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    const grid: ScanCell[] = [];

    // 1. Project all in-memory ships — GECMDS.C:2700-2720
    for (const other of this.shipService.findAllShips()) {
      if (other.userid === ship.userid && other.shipno === ship.shipno) continue;

      const cell = projectRangeCell(ship, other, scanRange);
      if (!cell) continue;

      // GECMDS.C:2710-2715: status==GESTAT_AUTO → '+', else '='
      const char = other.status === 1 ? '+' : '=';
      grid.push({ x: cell.x, y: cell.y, type: 'ship', char });
    }

    // 2. Project planets in the player's current sector — GECMDS.C:2640 (004 wire-up)
    // Sector coords derived from integer part of ship's galaxy-space coords
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    const planets = this.galaxyService.getSectorPlanets(xsect, ysect);
    for (const planet of planets) {
      const cell = projectRangeCell(ship, planet, scanRange);
      if (!cell) continue;
      grid.push({ x: cell.x, y: cell.y, type: 'planet', char: 'O' });
    }

    // 3. Project visible wormholes — GECMDS.C:2640 (004 wire-up)
    const wormholes = this.galaxyService.getSectorWormholes(xsect, ysect);
    for (const wormhole of wormholes) {
      if (wormhole.visible !== 1) continue;
      const cell = projectRangeCell(ship, wormhole, scanRange);
      if (!cell) continue;
      grid.push({ x: cell.x, y: cell.y, type: 'wormhole', char: 'W' });
    }

    // 4. Self-cell — GECMDS.C:2721 map[MAXY/2][MAXX/2] = '*'
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
    };
  }

  /**
   * Text-only planet lookup by name — galaxy-wide named-planet resolution.
   * Deviation from original: original used numeric plnum in current sector.
   * @see GECMDS.C:2295 scan_pl (deviation documented in research.md Decision 8)
   * @see contracts/scan-projection.md §"scan pl"
   */
  private scanPl(ship: ShipState, args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        lines: [{ text: formatMessage(MessageId.SCANFMT), category: 'system' }],
      };
    }

    const name = args.join(' ');
    const planet = this.galaxyService.findPlanetByName(name);

    if (!planet) {
      return {
        lines: [{ text: formatMessage(MessageId.NO_SUCH_PLANET), category: 'system' }],
      };
    }

    const lines: CommandResult['lines'] = [];

    // GECMDS.C:2326 — Planet #<plnum>: <name>
    lines.push({
      text: formatMessage(MessageId.SCAN08, planet.plnum, planet.name),
      category: 'info',
    });

    // GECMDS.C:2327 — dashes
    lines.push({ text: formatMessage(MessageId.SCAN_DASHES), category: 'info' });

    // GECMDS.C:2330 — ownership (optional)
    if (planet.userid) {
      lines.push({
        text: formatMessage(MessageId.SCAN09, planet.userid),
        category: 'info',
      });
    }

    // GECMDS.C:2332 — bearing/distance only when planet is in player's sector
    // Omitted for cross-sector lookups (research.md Decision 8)
    const shipXsect = Math.floor(ship.xcoord);
    const shipYsect = Math.floor(ship.ycoord);
    if (planet.xsect === shipXsect && planet.ysect === shipYsect) {
      const dist = Math.sqrt(
        Math.pow(planet.xcoord - ship.xcoord, 2) +
        Math.pow(planet.ycoord - ship.ycoord, 2),
      );
      // TODO(006): compute bearing from GEFUNCS.C cdistance
      lines.push({
        text: formatMessage(MessageId.SCAN10, 0, dist.toFixed(2)),
        category: 'info',
      });
    }

    // GECMDS.C:2337-2349 — environment
    const envIdx = Math.max(0, Math.min(3, planet.enviorn));
    const envStr = [
      formatMessage(MessageId.SCAN12), // 0 Earth-like
      formatMessage(MessageId.SCAN13), // 1 Hostile
      formatMessage(MessageId.SCAN14), // 2 Toxic
      formatMessage(MessageId.SCAN15), // 3 Inferno-like
    ][envIdx];
    lines.push({
      text: formatMessage(MessageId.SCAN11) + envStr,
      category: 'info',
    });

    // GECMDS.C:2350-2356 — resources (table-driven like env)
    const resIdx = Math.max(0, Math.min(3, planet.resource));
    const resStr = RES_DISPLAY[resIdx] ?? 'Unknown';
    lines.push({
      text: formatMessage(MessageId.SCAN16) + resStr,
      category: 'info',
    });

    // Cross-sector location line
    if (planet.xsect !== shipXsect || planet.ysect !== shipYsect) {
      lines.push({
        text: formatMessage(MessageId.SCAN_LOCATED_IN, planet.xsect, planet.ysect),
        category: 'info',
      });
    }

    // Beacon visibility — research Decision 10
    const planetState = this.planetService.get(planet.xsect, planet.ysect, planet.plnum);
    if (planetState?.beacon) {
      lines.push({
        text: formatMessage(MessageId.SCAN_BEACON, planet.name || `planet ${planet.plnum}`, planetState.beacon),
        category: 'info',
      });
    }

    return { lines };
  }
}
