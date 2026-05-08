import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { Command, CommandContext, CommandResult, ScanCell, ScanRenderEvent, SidePanelRow } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT, projectRangeCell } from '../../constants';
import { buildScantab, Scantab } from './helpers/scantab';
import { ITEM_NAMES } from '../../constants/items';

/**
 * Convert raw speed units to a display string for the side panel.
 * - speed === 0            → 'Stopped'
 * - speed > 0 && < 1000   → 'Impulse'
 * - speed >= 1000          → 'Warp X.Y'  (e.g. 4500 → 'Warp 4.5')
 *
 * @see GECMDS.C:3019 printmapfull — speed formatting
 */
function showarpDisplay(speed: number): string {
  if (speed === 0) return 'Stopped';
  if (speed < 1000) return 'Impulse';
  return `Warp ${(speed / 1000).toFixed(1)}`;
}

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

  /**
   * Per-player scantab state — keyed by `${userid}#${shipno}`.
   * Populated on `scan ra`/`scan se`; cleared on disconnect, death, or dock.
   * @see contracts/scan-render.md §3
   */
  private readonly scantabMap = new Map<string, Scantab>();

  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
    private readonly galaxyService: GalaxyService,
    private readonly planetService: PlanetStateService,
  ) {}

  /**
   * Remove the scantab entry for a player — idempotent (no-op for missing keys).
   * Call on disconnect, ship destruction, or dock.
   * @see contracts/scan-render.md §3
   */
  clearScantab(userid: string, shipno: number): void {
    this.scantabMap.delete(`${userid}#${shipno}`);
  }

  private getScantab(userid: string, shipno: number): Scantab | null {
    return this.scantabMap.get(`${userid}#${shipno}`) ?? null;
  }

  private setScantab(userid: string, shipno: number, tab: Scantab): void {
    this.scantabMap.set(`${userid}#${shipno}`, tab);
  }

  private scanHelp(): CommandResult {
    return {
      lines: [
        { text: 'Usage: scan <mode>', category: 'system' },
        { text: '  sh      — ships in sector', category: 'system' },
        { text: '  pl      — planets in sector', category: 'system' },
        { text: '  ra      — range scan (tactical grid)', category: 'system' },
        { text: '  se      — sector scan (wider view)', category: 'system' },
        { text: '  lo      — local scan', category: 'system' },
        { text: '  lo full — local scan, full detail', category: 'system' },
      ],
    };
  }

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
      if (args[1]?.toLowerCase() === 'full') {
        return this.scanLoFull(ship);
      }
      return this.scanLo(ship);
    }

    if (sub === 'sh') {
      return this.scanSh(ship, args.slice(1));
    }

    if (sub === 'pl') {
      return this.scanPl(ship, args.slice(1));
    }

    if (sub === 'ra') {
      return this.handleRangeScan(ship, args.slice(1));
    }

    if (sub === 'se') {
      return this.handleSectorScan(ship);
    }

    return this.scanHelp();
  }

  /**
   * Range-centred tactical scan producing a scanGrid payload.
   * Projection order per contracts/scan-projection.md:
   *   1. All in-range ships (excluding self)
   *   2. All planets in player's current sector
   *   3. All visible wormholes in player's current sector
   *   4. Self-cell
   *
   * Deviation D1: ship cells use scantab letters (A..Z) instead of the original
   * '+' (AI) and '=' (manual) glyphs. This aligns `sca lo` with `sca ra`/`sca se`
   * for consistent letter-based identification.
   *
   * @see GECMDS.C:2640 scan_lo
   */
  private scanLo(ship: ShipState): CommandResult {
    // Not-in-flight guard — orbit, docked, or dead (mirrors sca ra / sca se)
    if (ship.where >= 10) {
      return {
        ...this.scanHelp(),
      };
    }

    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    // Build / update the scantab (D1: letters used for ship cells)
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    const grid: ScanCell[] = [];

    // 1. Project all in-range ships via scantab — GECMDS.C:2700-2720
    // Deviation D1: char = entry.letter ('A'..'Z') not '+' / '='
    for (const entry of newScantab) {
      const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
      if (!other) continue;

      const cell = projectRangeCell(ship, other, scanRange);
      if (!cell) continue;

      grid.push({ x: cell.x, y: cell.y, type: 'ship', char: entry.letter });
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
      if (!wormhole.visible) continue;
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

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';

    const header = `Range: ${scanRange / 10000}pc — Sector ${xsect},${ysect}`;
    return {
      lines: [{ text: header, category: 'info' }],
      scanRender: { kind: 'lo', mode, cells: grid, header },
    };
  }

  /**
   * Full-detail tactical scan — same grid as `sca lo` but with a side-panel legend.
   * Each visible ship gets a SidePanelRow: letter, distance (integer parsecs),
   * bearing (0..359), heading (0..359), speedDisplay, and optionally name.
   *
   * The name field is only included when `ship.scanNames === true` (SCANNAMES).
   *
   * Rows are ordered by ascending distance (same order as the scantab).
   *
   * @see GECMDS.C:3019 printmapfull
   * @see specs/015-scan-modes/plan.md §T032
   */
  private scanLoFull(ship: ShipState): CommandResult {
    // Not-in-flight guard — orbit, docked, or dead
    if (ship.where >= 10) {
      return {
        ...this.scanHelp(),
      };
    }

    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    // Build / update the scantab
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    const grid: ScanCell[] = [];

    // 1. Project in-range ships with scantab letters (same as sca lo)
    for (const entry of newScantab) {
      const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
      if (!other) continue;

      const cell = projectRangeCell(ship, other, scanRange);
      if (!cell) continue;

      grid.push({ x: cell.x, y: cell.y, type: 'ship', char: entry.letter });
    }

    // 2. Planets in the player's current sector
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    const planets = this.galaxyService.getSectorPlanets(xsect, ysect);
    for (const planet of planets) {
      const cell = projectRangeCell(ship, planet, scanRange);
      if (!cell) continue;
      grid.push({ x: cell.x, y: cell.y, type: 'planet', char: 'O' });
    }

    // 3. Visible wormholes
    const wormholes = this.galaxyService.getSectorWormholes(xsect, ysect);
    for (const wormhole of wormholes) {
      if (!wormhole.visible) continue;
      const cell = projectRangeCell(ship, wormhole, scanRange);
      if (!cell) continue;
      grid.push({ x: cell.x, y: cell.y, type: 'wormhole', char: 'W' });
    }

    // 4. Self-cell
    grid.push({
      x: Math.floor(SCAN_GRID_WIDTH / 2),
      y: Math.floor(SCAN_GRID_HEIGHT / 2),
      type: 'self',
      char: '*',
    });

    // Build side-panel rows (sorted by ascending distance — scantab is already sorted)
    const sidePanel: SidePanelRow[] = newScantab.map(entry => {
      const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
      const row: SidePanelRow = {
        letter: entry.letter,
        distance: Math.round(entry.dist / 10000),
        bearing: entry.bearing,
        heading: entry.heading,
        speedDisplay: showarpDisplay(entry.speed),
      };
      if (ship.scanNames && other) {
        row.name = other.shipname;
      }
      return row;
    });

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';
    const header = `Range: ${scanRange / 10000}pc — Sector ${xsect},${ysect}`;

    return {
      lines: [{ text: header, category: 'info' }],
      scanRender: { kind: 'lo-full', mode, cells: grid, header, sidePanel },
    };
  }

  /**
   * Range-radar scan — projects all in-range ships onto a 30×15 grid at the
   * requested zoom level. Level is coerced to 1 when out-of-range or non-numeric.
   *
   * Formula (GECMDS.C:2510):
   *   effective_range = scanrange / pow(10.0 - level, 2.0)
   *
   * Grid projection (GECMDS.C:2515-2540):
   *   range_doubled = 2 * effective_range
   *   xfactor = range_doubled / (MAXX - 1)
   *   yfactor = range_doubled / (MAXY - 1)
   *   xf = (other.xcoord - self.xcoord) / xfactor + MAXX / 2.0
   *   yf = (other.ycoord - self.ycoord) / yfactor + MAXY / 2.0
   *
   * @see GECMDS.C:2484 scan_ra
   * @see GECMDS.C:2510 range = scanrange / pow(10.0 - scan_level, 2.0)
   */
  private handleRangeScan(ship: ShipState, args: string[]): CommandResult {
    // Not-in-flight guard — orbit, docked, or dead
    if (ship.where >= 10) {
      return {
        ...this.scanHelp(),
      };
    }

    // Parse and coerce level: 0 | >9 | non-numeric | missing → 1
    let level = parseInt(args[0] ?? '', 10);
    if (isNaN(level) || level < 1 || level > 9) {
      level = 1;
    }

    const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;

    // GECMDS.C:2510 — effective range for projection (zoom)
    const effectiveRange = scanRange / Math.pow(10 - level, 2);

    // Build/update the scantab using the full scanRange for in-range detection
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    const cells: ScanCell[] = [];

    // Project each scantab entry onto the grid
    const rangeDbl = 2 * effectiveRange;
    const xfactor = rangeDbl / (SCAN_GRID_WIDTH - 1);
    const yfactor = rangeDbl / (SCAN_GRID_HEIGHT - 1);

    for (const entry of newScantab) {
      // Find the ship state for this scantab entry
      const other = allShips.find(
        s => `${s.userid}#${s.shipno}` === entry.shipKey,
      );
      if (!other) continue;

      const xf = (other.xcoord - ship.xcoord) / xfactor + SCAN_GRID_WIDTH / 2.0;
      const yf = (other.ycoord - ship.ycoord) / yfactor + SCAN_GRID_HEIGHT / 2.0;

      if (xf >= 0 && xf < SCAN_GRID_WIDTH && yf >= 0 && yf < SCAN_GRID_HEIGHT) {
        const colour: ScanCell['colour'] = other.status === 1 ? 'ai' : 'human';
        cells.push({
          x: Math.floor(xf),
          y: Math.floor(yf),
          type: 'ship',
          char: entry.letter,
          colour,
        });
      }
    }

    // Self-cell at grid centre — GECMDS.C:2550 map[MAXY/2][MAXX/2] = '*'
    cells.push({
      x: Math.floor(SCAN_GRID_WIDTH / 2),
      y: Math.floor(SCAN_GRID_HEIGHT / 2),
      type: 'self',
      char: '*',
      colour: 'self',
    });

    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const header = `Range: ${effectiveRange} — Sector ${xsect},${ysect}`;

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';

    return {
      lines: [{ text: header, category: 'info' }],
      scanRender: { kind: 'ra', mode, cells, header },
    };
  }

  /**
   * Sector scan — projects all objects in the player's current 1×1 sector onto a
   * 30×15 grid at high resolution. The grid covers only the current sector
   * (sector-relative coords 0.0..1.0 mapped to 0..29 × 0..14).
   *
   * Rendering precedence (last-writer wins): mine → planet → ship → self.
   *
   * Colour categories: self → 'self', human (status≠1) → 'human',
   * AI (status===1) → 'ai', planet → 'planet'.
   *
   * Letter assignment is shared with `sca ra` via the same scantab slot so
   * letters are sticky across mode switches.
   *
   * @see GECMDS.C:2562 scan_se
   */
  private handleSectorScan(ship: ShipState): CommandResult {
    // Not-in-flight guard — orbit, docked, or dead
    if (ship.where >= 10) {
      return {
        ...this.scanHelp(),
      };
    }

    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;

    // Build / update the shared scantab (same slot as sca ra)
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    /**
     * Project a galaxy-space coordinate into the sector grid.
     * Sector-relative coords (0.0..1.0) map to grid (0..SCAN_GRID_WIDTH-1).
     * @see specs/015-scan-modes/plan.md §"Projection for sector scan"
     */
    const project = (xcoord: number, ycoord: number): { x: number; y: number } => {
      const relX = xcoord - xsect;  // 0.0..1.0
      const relY = ycoord - ysect;  // 0.0..1.0
      const x = Math.max(0, Math.min(SCAN_GRID_WIDTH - 1, Math.floor(relX * SCAN_GRID_WIDTH)));
      const y = Math.max(0, Math.min(SCAN_GRID_HEIGHT - 1, Math.floor(relY * SCAN_GRID_HEIGHT)));
      return { x, y };
    };

    // Use a Map keyed by "${x},${y}" so later writes overwrite earlier ones.
    // Build order: wormholes first, mines, then planets, ships, self — giving
    // self the highest precedence.
    const cellMap = new Map<string, ScanCell>();

    const put = (cell: ScanCell) => {
      cellMap.set(`${cell.x},${cell.y}`, cell);
    };

    // 1. Visible wormholes in this sector — lowest precedence
    const wormholes = this.galaxyService.getSectorWormholes(xsect, ysect);
    for (const wh of wormholes) {
      if (!wh.visible) continue;
      const { x, y } = project(wh.xcoord, wh.ycoord);
      put({ x, y, type: 'wormhole', char: 'W' });
    }

    // 2. Planets in this sector
    const planets = this.galaxyService.getSectorPlanets(xsect, ysect);
    for (const planet of planets) {
      const { x, y } = project(planet.xcoord, planet.ycoord);
      const char = String(planet.plnum % 10);
      put({ x, y, type: 'planet', char, colour: 'planet' });
    }

    // 3. Other ships in this sector (from scantab for letter assignment)
    for (const entry of newScantab) {
      const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
      if (!other) continue;
      // Sector filter — only include ships in the same sector
      if (Math.floor(other.xcoord) !== xsect || Math.floor(other.ycoord) !== ysect) continue;

      const { x, y } = project(other.xcoord, other.ycoord);
      const colour: ScanCell['colour'] = other.status === 1 ? 'ai' : 'human';
      put({ x, y, type: 'ship', char: entry.letter, colour });
    }

    // 4. Self — highest precedence, always at its projected position
    const selfPos = project(ship.xcoord, ship.ycoord);
    put({ x: selfPos.x, y: selfPos.y, type: 'self', char: '*', colour: 'self' });

    const cells: ScanCell[] = Array.from(cellMap.values());

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';
    const header = `Sector ${xsect},${ysect}`;

    return {
      lines: [{ text: header, category: 'info' }],
      scanRender: { kind: 'se', mode, cells, header },
    };
  }

  /**
   * Text-only scan of a named ship — no scanGrid field.
   * @see GECMDS.C:2190 scan_sh
   */
  private scanSh(ship: ShipState, args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        ...this.scanHelp(),
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
        ...this.scanHelp(),
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

    // Spy-owner reveal — per-item inventory (D3)
    // @see GECMDS.C:2367-2375
    if (planetState && planetState.spyowner
        && planetState.spyowner.toLowerCase() === ship.userid.toLowerCase()) {
      lines.push({ text: 'Spy intel — Planet Inventory:', category: 'info' });
      for (let i = 0; i < planetState.items.length; i++) {
        const it = planetState.items[i];
        if (it && it.qty > 0n) {
          const selling = it.sell ? ' (selling)' : '';
          lines.push({
            text: `  ${ITEM_NAMES[i]}:  ${it.qty}${selling}`,
            category: 'info',
          });
        }
      }
    }

    return { lines };
  }
}
