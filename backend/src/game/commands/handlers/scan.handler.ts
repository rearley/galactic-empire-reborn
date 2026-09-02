import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { Command, CommandContext, CommandResult, ScanCell, ScanRenderEvent, SidePanelRow } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { cbearing } from '../../physics/physics-math';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT, SCAN_LO_PROJECTION_MULTIPLIER, projectRangeCell, MAXX, MAXY, UNIVMAX } from '../../constants';
import { buildScantab, Scantab } from './helpers/scantab';
import { resolveScanSubcommand } from './helpers/scan-subcommand';
import { decideScanAnnouncement } from '../scan-announce';
import { inScanRange, damstr } from '../../combat/combat-math';
import { ITEM_NAMES } from '../../constants/items';
import { planetOwnerLabel, isNeutralZoneOwner, NEUTRAL_ZONE_OWNER_DISPLAY } from '../../combat/neutral-zone';
import { scanDistanceUnits } from './helpers/scan-distance';
import { scanShipColour } from './helpers/scan-ship-colour';

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
  MessageId.SCAN12, // 0 — Inferno-like (worst)
  MessageId.SCAN13, // 1 — Toxic
  MessageId.SCAN14, // 2 — Hostile
  MessageId.SCAN15, // 3 — Earth-like (best)
] as const;

/** Resource string table indexed by `resource` (0..3). @see GECMDS.C:2351-2356 */
const RES_STRINGS = [
  MessageId.SCAN12, // 0 — Barren (C reuses one table for both axes)
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

/**
 * Relative bearing from a ship to a point, in whole degrees, 0 = dead ahead.
 *
 * @see GEFUNCS.C cbearing(from, to, heading)
 */
function relativeBearing(
  ship: { xcoord: number; ycoord: number; heading: number },
  target: { xcoord: number; ycoord: number },
): number {
  // Delegates to the shared cbearing so scans report the SIGNED -180..180
  // bearing the original does. This used to fold to 0..359, which made every
  // target off the port bow print a value `pha` and `rot` reject outright.
  // @see GELIB.C:142-166
  return Math.round(cbearing(ship, target, ship.heading));
}

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
        // `sh` needs a target — it reports one ship in detail. `pl` lists, then
        // takes a number for detail. Saying "ships in sector" implied `sca sh`
        // would list them, and it answers with this help instead.
        { text: '  sh <name|letter> — detail on one ship', category: 'system' },
        { text: '  pl [number]      — planets here, or detail on one', category: 'system' },
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
      // 'sca' is the canonical verb in the original command table
      // (GECMDS.C:158). The router matches on the first 3 characters, so both
      // 'sca' and 'scan' resolve. The 2-char 'sc' is deliberately NOT an alias:
      // strncmp("sc","sca",3) compares '\0' against 'a', so the original
      // rejected it.
      aliases: ['sca'],
      minArgs: 0,
      argMissingMessage: formatMessage(MessageId.SCANFMT),
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    // @see GECMDS.C:2143 — tactical-computer gate (TABROKE)
    if (ship.tactical !== 0) {
      return { lines: [{ text: formatMessage(MessageId.TABROKE), category: 'system' }] };
    }
    // @see GECMDS.C:2150 — jammer gate (JAMMER4)
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    // C matches sub-commands with `genearas`, so `sca ship` and `sca planets`
    // work, and prints SCANFMT for a bare `sca` rather than defaulting to a
    // full local scan. @see GECMDS.C:2154, 2157-2172
    const sub = resolveScanSubcommand(args[0]);
    if (sub === null) return this.scanHelp();

    // Not-in-flight guard for the grid scan modes (ra / se / lo / lo full).
    // Docked, in-orbit, or dead (where >= 10) → a single system-category line and
    // NO scanRender. Text lookups (sh / pl) are unaffected.
    // @see specs/015-scan-modes/spec.md FR-011, SC-006
    // @see specs/015-scan-modes/data-model.md §"Invalid state"
    // @see specs/015-scan-modes/plan.md §"On failure ... non-negotiable"
    if ((sub === 'lo' || sub === 'ra' || sub === 'se') && ship.where >= 10) {
      return { lines: [{ text: formatMessage(MessageId.SCAN_NOT_IN_FLIGHT), category: 'system' }] };
    }

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
      return await this.scanPl(ship, args.slice(1));
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
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    // S-001: C `scan_lo` projects at 10× scanRange — the long-range overview.
    // @see GECMDS.C:2668 range = scanrange * 10.0
    // @see reference/wiki/player-ships.md:39 "long range scanner is 10x this value"
    // The scantab detection gate remains at full scanRange so cloaking and
    // range-based exclusion stay consistent with all other scan modes;
    // only the *projection radius* widens. Ships beyond scanRange but within
    // 10×scanRange are NOT projected (we don't know about them via the scantab).
    // To match C's "iterate all ships and project" semantics we additionally
    // project ships up to 10× scanRange that are NOT cloaked.
    const projectionRange = scanRange * SCAN_LO_PROJECTION_MULTIPLIER;

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

      const cell = projectRangeCell(ship, other, projectionRange);
      if (!cell) continue;

      grid.push({ x: cell.x, y: cell.y, type: 'ship', char: entry.letter });
    }

    // 2. Project planets within long-range scan across all nearby sectors
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const sectorRadius = Math.ceil(projectionRange / 10000);

    for (let sx = xsect - sectorRadius; sx <= xsect + sectorRadius; sx++) {
      for (let sy = ysect - sectorRadius; sy <= ysect + sectorRadius; sy++) {
        // Universe bounds, not the display grid: sectors run -UNIVMAX..+UNIVMAX
        // with the origin at the centre. The old 0..MAXX test skipped every
        // western and southern sector and probed columns past the edge.
        if (sx < -UNIVMAX || sx > UNIVMAX || sy < -UNIVMAX || sy > UNIVMAX) continue;
        for (const planet of this.galaxyService.getSectorPlanets(sx, sy)) {
          const cell = projectRangeCell(ship, planet, projectionRange);
          if (!cell) continue;
          // 'P' for all planets — plnum is per-sector so using it across sectors creates duplicates
          grid.push({ x: cell.x, y: cell.y, type: 'planet', char: 'P' });
        }
        for (const wormhole of this.galaxyService.getSectorWormholes(sx, sy)) {
          if (!wormhole.visible) continue;
          const cell = projectRangeCell(ship, wormhole, projectionRange);
          if (!cell) continue;
          grid.push({ x: cell.x, y: cell.y, type: 'wormhole', char: 'W' });
        }
      }
    }

    // 4. Self-cell — GECMDS.C:2721 map[MAXY/2][MAXX/2] = '*'
    grid.push({
      x: Math.floor(SCAN_GRID_WIDTH / 2),
      y: Math.floor(SCAN_GRID_HEIGHT / 2),
      type: 'self',
      char: '*',
    });

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';

    const header = `Range: ${projectionRange / 10000}pc — Sector ${xsect},${ysect}`;
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
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;

    // S-001: long-range projection — see scanLo for rationale.
    const projectionRange = scanRange * SCAN_LO_PROJECTION_MULTIPLIER;

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

      const cell = projectRangeCell(ship, other, projectionRange);
      if (!cell) continue;

      grid.push({ x: cell.x, y: cell.y, type: 'ship', char: entry.letter });
    }

    // 2. Planets and wormholes within long-range scan across all nearby sectors
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const sectorRadius = Math.ceil(projectionRange / 10000);

    for (let sx = xsect - sectorRadius; sx <= xsect + sectorRadius; sx++) {
      for (let sy = ysect - sectorRadius; sy <= ysect + sectorRadius; sy++) {
        // Universe bounds, not the display grid: sectors run -UNIVMAX..+UNIVMAX
        // with the origin at the centre. The old 0..MAXX test skipped every
        // western and southern sector and probed columns past the edge.
        if (sx < -UNIVMAX || sx > UNIVMAX || sy < -UNIVMAX || sy > UNIVMAX) continue;
        for (const planet of this.galaxyService.getSectorPlanets(sx, sy)) {
          const cell = projectRangeCell(ship, planet, projectionRange);
          if (!cell) continue;
          grid.push({ x: cell.x, y: cell.y, type: 'planet', char: 'P' });
        }
        for (const wormhole of this.galaxyService.getSectorWormholes(sx, sy)) {
          if (!wormhole.visible) continue;
          const cell = projectRangeCell(ship, wormhole, projectionRange);
          if (!cell) continue;
          grid.push({ x: cell.x, y: cell.y, type: 'wormhole', char: 'W' });
        }
      }
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
        // Rounded like bearing and like `rep nav`: an unrounded float rendered
        // as "Hdg:69.83440234557376" and broke the legend's column alignment.
        heading: Math.round(entry.heading) % 360,
        speedDisplay: showarpDisplay(entry.speed),
      };
      if (ship.scanNames && other) {
        row.name = other.shipname;
      }
      return row;
    });

    const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';
    const header = `Range: ${projectionRange / 10000}pc — Sector ${xsect},${ysect}`;

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
    // Not-in-flight guard is enforced centrally in handle() (spec 015 FR-011/SC-006).

    // Parse and coerce level: 0 | >9 | non-numeric | missing → 1
    let level = parseInt(args[0] ?? '', 10);
    if (isNaN(level) || level < 1 || level > 9) {
      level = 1;
    }

    const scanRange = this.classCache.get(ship.shpclass)?.scanRange ?? 0;

    // GECMDS.C:2510 — effective range in raw units (e.g. scanrange=100000, level=1 → 1234)
    const effectiveRangeRaw = scanRange / Math.pow(10 - level, 2);

    // S-003: GECMDS.C:2517 — convert raw → sector units before projection.
    // Without this divide-by-10000, xfactor is in raw-units-per-cell while
    // target coords are in sector-units → every target collapses to the centre.
    const effectiveRangeSectors = effectiveRangeRaw / 10000.0;

    // Build/update the scantab using the full scanRange for in-range detection
    const prevScantab = this.getScantab(ship.userid, ship.shipno);
    const allShips = this.shipService.findAllShips();
    const newScantab = buildScantab(ship, allShips, prevScantab, scanRange);
    this.setScantab(ship.userid, ship.shipno, newScantab);

    const cells: ScanCell[] = [];

    // Project each scantab entry onto the grid
    const rangeDbl = 2 * effectiveRangeSectors;
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
        const colour: ScanCell['colour'] = scanShipColour(other.status);
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
    // Header shows raw effective range to preserve the C-source "Range: %ld" format
    // (GECMDS.C:2515 SCAN24 — spr("%ld",(long)range) where range is still raw at that point).
    const header = `Range: ${Math.round(effectiveRangeRaw)} — Sector ${xsect},${ysect}`;

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

    // The galaxy now covers the whole universe — sectors -UNIVMAX..+UNIVMAX on
    // both axes, matching where Cybertrons spawn (GECYBS.C:158
    // `rndm(univmax*2.0) - univmax`). It used to be generated only for
    // 0..MAXX-1 x 0..MAXY-1, so negative sectors had no terrain and the lookups
    // had to be skipped. The bound is the universe, and getSectorPlanets /
    // getSectorWormholes throw outside it, so keep guarding — a ship that has
    // wrapped mid-tick can momentarily sit on the boundary.
    const inGalaxy =
      xsect >= -UNIVMAX && xsect <= UNIVMAX && ysect >= -UNIVMAX && ysect <= UNIVMAX;

    // 1. Visible wormholes in this sector — lowest precedence
    if (inGalaxy) {
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
    }

    // 3. Other ships in this sector (from scantab for letter assignment)
    for (const entry of newScantab) {
      const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
      if (!other) continue;
      // Sector filter — only include ships in the same sector
      if (Math.floor(other.xcoord) !== xsect || Math.floor(other.ycoord) !== ysect) continue;

      const { x, y } = project(other.xcoord, other.ycoord);
      const colour: ScanCell['colour'] = scanShipColour(other.status);
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
   * Single-letter args do a scantab lookup (A..Z assigned by sca lo/ra/se) so that
   * `sca sh a` finds the ship the player scanned as 'A', not a name substring match.
   * Falls back to name search when arg is multi-char or the scantab has no such entry.
   * @see GECMDS.C:2190 scan_sh
   */
  private scanSh(ship: ShipState, args: string[]): CommandResult {
    if (args.length === 0) {
      return this.scanHelp();
    }
    const arg = args.join(' ');

    let target: ShipState | undefined;

    // Single alpha char → scantab-only lookup (letter-based targeting, original game style)
    if (arg.length === 1 && /^[a-zA-Z]$/.test(arg)) {
      const letter = arg.toUpperCase();
      const scantab = this.getScantab(ship.userid, ship.shipno);
      if (!scantab || scantab.length === 0) {
        return {
          lines: [{ text: 'No scan data. Run "sca lo" first to assign ship letters.', category: 'system' }],
        };
      }
      const entry = scantab.find((e) => e.letter === letter);
      if (!entry) {
        return {
          lines: [{ text: `No ship assigned letter ${letter}. Run "sca lo" to update scan.`, category: 'system' }],
        };
      }
      const hashIdx = entry.shipKey.lastIndexOf('#');
      const entryUserid = entry.shipKey.slice(0, hashIdx);
      const entryShipno = parseInt(entry.shipKey.slice(hashIdx + 1), 10);
      target = this.shipService.get(entryUserid, entryShipno);
      if (!target) {
        return {
          lines: [{ text: `Ship ${letter} is no longer active.`, category: 'system' }],
        };
      }
    } else {
      // Multi-char arg → name search
      target = this.shipService.findByName(arg);
      if (!target) {
        return {
          lines: [{ text: `No ship named "${arg}" found.`, category: 'system' }],
        };
      }
      // S-004: fully-cloaked targets are unscannable — mirrors C `findshp(name,1)`
      // which returns -1 for `wptr->cloak >= 10`. @see GECMDS.C:1511
      if (target.cloak >= 10) {
        return {
          lines: [{ text: `No ship named "${arg}" found.`, category: 'system' }],
        };
      }
    }
    // Block scanning self — GECMDS.C:2209 (prints FOOLISH)
    if (target.userid === ship.userid && target.shipno === ship.shipno) {
      return {
        lines: [{ text: 'You look in a mirror.', category: 'system' }],
      };
    }
    const classInfo = this.classCache.get(ship.shpclass);
    const scanRange = classInfo?.scanRange ?? 0;
    const dist = Math.sqrt(
      Math.pow(target.xcoord - ship.xcoord, 2) + Math.pow(target.ycoord - ship.ycoord, 2),
    );
    // Out of range — GECMDS.C:2220
    if (!inScanRange(ship, target, scanRange)) {
      return {
        lines: [{ text: `${target.shipname} is out of scanner range.`, category: 'system' }],
      };
    }
    const bearing = relativeBearing(ship, target);
    const ltr = target.status === 1 ? '+' : '=';

    // C tells the scanned ship it was looked at, every time — reconnaissance
    // is never silent. @see GECMDS.C:2261-2280
    const announcement = this.buildScanAnnouncement(ship, target);
    const briefLine: CommandResult['lines'][number] = {
      text: `${ltr} ${target.shipname} — class ${target.shpclass}, range ${dist.toFixed(1)}, bearing ${bearing}.`,
      category: 'info',
    };

    // S-008: reveal damage/shields/kills intel when NEITHER ship is at warp.
    // GECMDS.C:2244-2256: gate is `warsptr->where != 1 && wptr->where != 1`.
    // where === 1 is hyperspace/at-warp; orbit (>= 10) and normal (0) DO reveal intel.
    if (ship.where !== 1 && target.where !== 1) {
      const dmgLabel = `Damage: ${damstr(target.damage)}`;
      const shieldLabel =
        target.shieldstat === 1 ? 'Shields: up' :
        target.shieldstat === 3 ? 'Shields: damaged' :
        'Shields: down';
      const killsLabel = `Kills: ${target.kills}`;
      return {
        lines: [
          briefLine,
          { text: `${dmgLabel}  ${shieldLabel}  ${killsLabel}`, category: 'info' },
        ],
        broadcasts: announcement,
      };
    }

    return { lines: [briefLine], broadcasts: announcement };
  }

  /**
   * Text-only planet lookup by name — galaxy-wide named-planet resolution.
   * Deviation from original: original used numeric plnum in current sector.
   * @see GECMDS.C:2295 scan_pl (deviation documented in research.md Decision 8)
   * @see contracts/scan-projection.md §"scan pl"
   */
  private async scanPl(ship: ShipState, args: string[]): Promise<CommandResult> {
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    // No arg → list planets in current sector (@see GECMDS.C:2295 plnum loop)
    //
    // Read the LIVE planet state, not GalaxyService's read-model: that one
    // hydrates once at boot and is never updated, so a planet claimed since
    // startup still listed as "(unnamed)" with no owner. Players scanned a
    // sector, picked what looked like a free planet, flew to it and only found
    // out it was taken when the landing was refused.
    if (args.length === 0) {
      const sectorPlanets = this.planetService.bySector(xsect, ysect);
      if (sectorPlanets.length === 0) {
        return { lines: [{ text: 'No planets in this sector.', category: 'system' }] };
      }
      const lines: CommandResult['lines'] = [
        { text: `Planets in sector (${xsect}, ${ysect}):`, category: 'system' },
      ];
      for (const p of sectorPlanets) {
        const label = p.name ? `${p.plnum}. ${p.name}` : `${p.plnum}. (unnamed)`;
        const owner = planetOwnerLabel(p.userid);
        lines.push({ text: `  ${label}${owner}`, category: 'info' });
      }
      lines.push({ text: 'Use "sca pl <number>" to scan a planet.', category: 'system' });
      return { lines };
    }

    // Numeric arg → plnum lookup in current sector (original GECMDS.C:2295)
    const num = parseInt(args[0], 10);
    let planet = !isNaN(num) && String(num) === args[0]
      ? this.planetService.bySector(xsect, ysect).find((p) => p.plnum === num) ?? null
      : null;

    // Name arg → cross-sector lookup (deviation D8)
    if (!planet) {
      planet = this.planetService.byName(args.join(' ')) ?? null;
    }

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
      // The neutral sentinel has no User row; resolving it through Prisma is
      // both a wasted query and how `**neutral**` reached the player's screen.
      const ownerRow = isNeutralZoneOwner(planet.userid)
        ? null
        : await this.prisma.user.findUnique({
            where: { userid: planet.userid },
            select: { username: true },
          });
      const ownerName = isNeutralZoneOwner(planet.userid)
        ? NEUTRAL_ZONE_OWNER_DISPLAY
        : ownerRow?.username ?? planet.userid;
      lines.push({
        text: formatMessage(MessageId.SCAN09, ownerName),
        category: 'info',
      });
    }

    // GECMDS.C:2332 — bearing/distance only when planet is in player's sector
    // Omitted for cross-sector lookups (research.md Decision 8)
    if (planet.xsect === xsect && planet.ysect === ysect) {
      const dist = Math.sqrt(
        Math.pow(planet.xcoord - ship.xcoord, 2) +
        Math.pow(planet.ycoord - ship.ycoord, 2),
      );
      // C uses the same cbearing(from, to, heading) call here as for ships
      // (GECMDS.C:2324 vs :2222). This was a literal 0 behind a TODO, so every
      // planet in a sector reported bearing 0 and there was no way to steer to
      // the one worth claiming.
      lines.push({
        text: formatMessage(MessageId.SCAN10, relativeBearing(ship, planet), scanDistanceUnits(dist)),
        category: 'info',
      });
    }

    // GECMDS.C:2337-2349 — environment
    const envIdx = Math.max(0, Math.min(3, planet.enviorn));
    const envStr = [
      formatMessage(MessageId.SCAN12), // 0 Inferno-like (worst)
      formatMessage(MessageId.SCAN13), // 1 Toxic
      formatMessage(MessageId.SCAN14), // 2 Hostile
      formatMessage(MessageId.SCAN15), // 3 Earth-like (best)
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
    if (planet.xsect !== xsect || planet.ysect !== ysect) {
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
  /**
   * The message the scanned ship receives. C always sends one of SCAN1/2/3 via
   * `outprfge(FILTER, shpnum)`, so being looked at is information the other
   * pilot gets. The port sent nothing and the three messages existed nowhere.
   *
   * Delivered to a `ship:<userid>:<shipno>` room so it reaches exactly that
   * pilot, the way C addresses a single terminal.
   *
   * @see GECMDS.C:2261-2280
   */
  private buildScanAnnouncement(
    scanner: ShipState,
    target: ShipState,
  ): CommandResult['broadcasts'] {
    const targetRange = this.classCache.get(target.shpclass)?.scanRange ?? 0;
    // `ltr == '?'` — has the scanned ship ever scanned the scanner?
    const targetTab = this.getScantab(target.userid, target.shipno);
    const scannerKey = `${scanner.userid}#${scanner.shipno}`;
    const knows =
      targetTab?.some((e) => e.shipKey === scannerKey && e.letter !== '?') ?? false;

    const a = decideScanAnnouncement(
      { shipname: scanner.shipname, xcoord: scanner.xcoord, ycoord: scanner.ycoord },
      { xcoord: target.xcoord, ycoord: target.ycoord, heading: target.heading, scanRange: targetRange },
      knows,
    );

    const text =
      a.kind === 'SCAN1'
        ? formatMessage(MessageId.SCAN1, a.scannerName ?? '?')
        : a.kind === 'SCAN2'
          ? formatMessage(MessageId.SCAN2, a.bearing)
          : formatMessage(MessageId.SCAN3, a.bearing);

    return [
      {
        room: `ship:${target.userid}:${target.shipno}`,
        event: 'command.notice',
        payload: { lines: [{ text, category: 'combat' }] },
      },
    ];
  }

}
