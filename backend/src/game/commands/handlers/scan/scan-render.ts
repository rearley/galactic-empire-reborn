import { showarp } from '../../../ship/showarp';
import { ShipState } from '../../../ship/ship-state.types';
import { CommandResult, ScanCell, ScanRenderEvent, SidePanelRow } from '../../command.types';
import { formatMessage, MessageId } from '../../messages';
import {
  SCAN_GRID_WIDTH,
  SCAN_GRID_HEIGHT,
  SCAN_LO_PROJECTION_MULTIPLIER,
  projectRangeCell,
  GESTAT_AUTO,
} from '../../../constants';
import { Scantab } from '../helpers/scantab';
import { MineState, MINE_SLOT_FREE } from '../../../combat/mine.registry';
import { scanShipColour } from '../helpers/scan-ship-colour';
import { GalaxyWormholeView } from '../../../galaxy/galaxy.types';
import type { Planet } from '@prisma/client';

/**
 * Canon's `scan_lo` map loop — every ship in the game, projected, gated by
 * nothing:
 *
 *   for (othusn=0 ; othusn < nships ; othusn++)
 *     if (ingegame(othusn))
 *       { ...project...
 *         if (in grid) map[y][x] = (status == GESTAT_AUTO) ? '+' : '='; }
 *
 * This used to iterate the SCANTAB instead. The scantab is canon's
 * IDENTIFICATION table, gated on cloak and on `scanrange` (GECMDS.C:1371) —
 * a third of the radius this projects, and a tenth of it in canon. So every
 * contact between the detection radius and the edge of the map was
 * structurally invisible: the outer ~90% of the grid could never draw
 * anything, which is the entire point of a LONG RANGE scan. A pilot parked
 * at the hub ran this with three Cybertrons 17.8, 21.6 and 21.7 sectors out
 * and saw empty space.
 *
 * The two tables answer different questions and canon keeps them apart:
 * the MAP says something is out there, the SCANTAB says what it is, how far
 * and on what bearing. Cloak is gated in the scantab alone, so a cloaked
 * ship shows here as a contact that cannot be identified, ranged or locked
 * — which is what canon does, deliberately or not.
 *
 * Deviation D1 is preserved where it means anything: a ship the scanner has
 * resolved keeps its scantab letter, so the map and the `sca lo full` legend
 * still agree and `loc <letter>` still addresses what you can see. Anything
 * unresolved falls back to canon's own glyphs.
 *
 * @see GECMDS.C:2686-2718 scan_lo
 * @see GECMDS.C:1371 the scantab's cloak + scanrange gate
 */
export function projectAllShips(
  ship: ShipState,
  allShips: ReadonlyArray<ShipState>,
  scantab: Scantab,
  projectionRange: number,
): ScanCell[] {
  const letterByKey = new Map(scantab.map((e) => [e.shipKey, e.letter]));
  const selfKey = `${ship.userid}#${ship.shipno}`;

  const cells: ScanCell[] = [];
  for (const other of allShips) {
    const key = `${other.userid}#${other.shipno}`;
    if (key === selfKey) continue;

    const cell = projectRangeCell(ship, other, projectionRange);
    if (!cell) continue;

    const char = letterByKey.get(key) ?? (other.status === GESTAT_AUTO ? '+' : '=');
    cells.push({ x: cell.x, y: cell.y, type: 'ship', char });
  }
  return cells;
}

/**
 * The scantab side panel — canon's `printmapfull()` (GECMDS.C:3019).
 *
 * Shared by `scan ra` (when SCANFULL is on, GECMDS.C:2571) and by this
 * port's `scan lo full`. It was written inline in the latter, which is how
 * SCANFULL came to be a settable option that no rendering code consulted.
 */
export function buildSidePanel(
  ship: ShipState,
  scantab: Scantab,
  allShips: ShipState[],
): SidePanelRow[] {
  return scantab.map((entry) => {
    const other = allShips.find((s) => `${s.userid}#${s.shipno}` === entry.shipKey);
    const row: SidePanelRow = {
      letter: entry.letter,
      // RAW units, as C prints them: `spr("%ld",(long)(sptr->ship[i].dist))`
      // at GECMDS.C:5985. Dividing by 10 000 collapsed the only continuous
      // range readout in the game to a single digit -- a droid closing from
      // 14 900 to 10 100 read "1" both times, and anything inside half a
      // sector read "0" -- exactly when a new pilot is deciding to fight or
      // run. docs/DECISIONS.md D7 already specifies a right-justified 6-char
      // field, which only makes sense for the raw magnitude.
      distance: Math.trunc(entry.dist),
      bearing: entry.bearing,
      // Already relative and signed from scantab; see its `heading` docs.
      heading: entry.heading,
      speedDisplay: showarp(entry.speed),
    };
    // GECMDS.C:3064 — the name row is printed only when SCANNAMES is set.
    if (ship.scanNames && other) {
      row.name = other.shipname;
    }
    return row;
  });
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
export function renderLoScan(
  ship: ShipState,
  scanRange: number,
  allShips: ShipState[],
  scantab: Scantab,
): CommandResult {
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

  const grid: ScanCell[] = [];

  // NO mine loop here. `scan_lo` (GECMDS.C:2640 onward) contains no `mptr`
  // iteration at all before printmap(). This method used to carry
  // it while citing scan_ra's line numbers, so the long-range overview drew
  // mines canon never puts there and the tactical scan showed clean space.

  // 1. Project EVERY ship in the game — GECMDS.C:2686-2718
  grid.push(...projectAllShips(ship, allShips, scantab, projectionRange));

  // NO PLANETS. `scan_lo`'s only projection loop is over ships
  // (GECMDS.C:2686 `for (othusn=0; othusn < nships; othusn++)`), and
  // `map_planets()` is called exactly once in the whole source — at
  // GECMDS.C:2634, inside `scan_se`, four lines before scan_lo even begins.
  // Planets are deliberately absent from the long-range overview.
  //
  // Drawing them put roughly two thousand 'P' cells onto a 450-cell grid in
  // our galaxy: a solid wall of planets with the ship markers and the '*'
  // self-cell buried inside it. `sca lo` is the first thing the welcome text
  // tells a new player to type, and it rendered as noise.
  // `sca se` is the mode that shows planets, and it still does.
  const xsect = Math.floor(ship.xcoord);
  const ysect = Math.floor(ship.ycoord);

  // 4. Self-cell — GECMDS.C:2721 map[MAXY/2][MAXX/2] = '*'
  grid.push({
    x: Math.floor(SCAN_GRID_WIDTH / 2),
    y: Math.floor(SCAN_GRID_HEIGHT / 2),
    type: 'self',
    char: '*',
  });

  const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';

  const header = formatMessage(MessageId.SCAN24, Math.round(projectionRange), xsect, ysect);
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
export function renderLoFullScan(
  ship: ShipState,
  scanRange: number,
  allShips: ShipState[],
  scantab: Scantab,
): CommandResult {
  // S-001: long-range projection — see renderLoScan for rationale.
  const projectionRange = scanRange * SCAN_LO_PROJECTION_MULTIPLIER;

  const grid: ScanCell[] = [];

  // 1. Same map as `sca lo` — every ship, gated by nothing.
  grid.push(...projectAllShips(ship, allShips, scantab, projectionRange));

  // NO PLANETS — same as `sca lo`. See the note there: map_planets() belongs
  // to scan_se alone (GECMDS.C:2634), and scan_lo projects ships only.
  const xsect = Math.floor(ship.xcoord);
  const ysect = Math.floor(ship.ycoord);

  // 4. Self-cell
  grid.push({
    x: Math.floor(SCAN_GRID_WIDTH / 2),
    y: Math.floor(SCAN_GRID_HEIGHT / 2),
    type: 'self',
    char: '*',
  });

  // Build side-panel rows (sorted by ascending distance — scantab is already sorted)
  const sidePanel = buildSidePanel(ship, scantab, allShips);

  const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';
  const header = formatMessage(MessageId.SCAN24, Math.round(projectionRange), xsect, ysect);

  // No log line: this is the ONE mode that produces a SCAN DATA card, and
  // the card carries the same header. Echoing it as well filled the event
  // log with rows of "Range Scan Dist:300000 (s:0 0)" duplicating the card
  // beside them. The other modes keep their line — they draw only to the
  // map, so the log is their sole textual confirmation.
  return {
    lines: [],
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
export function renderRangeScan(
  ship: ShipState,
  level: number,
  scanRange: number,
  allShips: ShipState[],
  scantab: Scantab,
  mines: MineState[],
): CommandResult {
  // GECMDS.C:2510 — effective range in raw units (e.g. scanrange=100000, level=1 → 1234)
  const effectiveRangeRaw = scanRange / Math.pow(10 - level, 2);

  // S-003: GECMDS.C:2517 — convert raw → sector units before projection.
  // Without this divide-by-10000, xfactor is in raw-units-per-cell while
  // target coords are in sector-units → every target collapses to the centre.
  const effectiveRangeSectors = effectiveRangeRaw / 10000.0;

  const cells: ScanCell[] = [];

  // Project each scantab entry onto the grid
  const rangeDbl = 2 * effectiveRangeSectors;
  const xfactor = rangeDbl / (SCAN_GRID_WIDTH - 1);
  const yfactor = rangeDbl / (SCAN_GRID_HEIGHT - 1);

  // Live mines. Canon's mine loop belongs to scan_ra — this is the zoomable
  // tactical scan, the only mode with an adjustable range, and therefore the
  // one a pilot uses to pick a way through a minefield.
  //
  //   for (i=0,mptr = mines; i<nummines;++mptr,++i)
  //       if (mptr->channel != 255) { xf = ...; yf = ...; }
  //
  // @see GECMDS.C:2529-2545. Drawn before ships so a contact in the same cell
  // takes it, matching canon's write order.
  for (const mine of mines) {
    if (mine.channel === MINE_SLOT_FREE) continue;
    const mxf = (mine.xcoord - ship.xcoord) / xfactor + SCAN_GRID_WIDTH / 2.0;
    const myf = (mine.ycoord - ship.ycoord) / yfactor + SCAN_GRID_HEIGHT / 2.0;
    if (mxf >= 0 && mxf < SCAN_GRID_WIDTH && myf >= 0 && myf < SCAN_GRID_HEIGHT) {
      cells.push({ x: Math.floor(mxf), y: Math.floor(myf), type: 'mine', char: '.' });
    }
  }

  for (const entry of scantab) {
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
  const header = formatMessage(MessageId.SCAN24, Math.round(effectiveRangeRaw), xsect, ysect);

  const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';

  return {
    lines: [{ text: header, category: 'info' }],
    // GECMDS.C:2571 — `if (waruptr->options[SCANFULL]) printmapfull(); else
    // printmap();`. SCANFULL is read in scan_ra and NOWHERE else: scan_se
    // (:2635) and scan_lo (:2723) call printmap() unconditionally. Omitting
    // the panel entirely, rather than sending an empty one, is what keeps
    // the option's two states distinguishable to the client.
    scanRender: {
      kind: 'ra',
      mode,
      cells,
      header,
      ...(ship.scanFull ? { sidePanel: buildSidePanel(ship, scantab, allShips) } : {}),
    },
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
 * `wormholes` and `planets` are already resolved (and empty when the ship
 * sits outside the galaxy bounds) — the caller owns the `inGalaxy` guard
 * because `GalaxyService.getSector*` throws outside it.
 *
 * @see GECMDS.C:2562 scan_se
 */
export function renderSectorScan(
  ship: ShipState,
  allShips: ShipState[],
  scantab: Scantab,
  mines: MineState[],
  wormholes: readonly GalaxyWormholeView[],
  planets: readonly Planet[],
): CommandResult {
  const xsect = Math.floor(ship.xcoord);
  const ysect = Math.floor(ship.ycoord);

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
  //
  // Canon's order, and it is not the intuitive one (GECMDS.C:2598-2634):
  //   mines '.'  ->  ships (letter)  ->  self '*'  ->  map_planets()
  // `map_planets()` is called LAST, four lines before printmap(), so a
  // planet overwrites a ship and even your own '*'. That reads wrong until
  // you notice that a planet sharing your cell means you are on top of it,
  // which `rep` and `orb` already tell you. Wormholes are ours and sit at
  // the bottom. @see docs/DECISIONS.md
  const cellMap = new Map<string, ScanCell>();

  const put = (cell: ScanCell) => {
    cellMap.set(`${cell.x},${cell.y}`, cell);
  };

  // 0. Live mines in THIS sector — canon draws them before anything else,
  // so a ship or the '*' standing on the same cell covers them.
  //   if (mptr->channel != 255 && (x==xsect && y==ysect)) map[y][x] = '.';
  // There is no ownership or detection gate: a live mine is drawn for
  // everyone, the ship that laid it included. @see GECMDS.C:2598-2609
  for (const mine of mines) {
    if (mine.channel === MINE_SLOT_FREE) continue;
    if (Math.floor(mine.xcoord) !== xsect || Math.floor(mine.ycoord) !== ysect) continue;
    const { x, y } = project(mine.xcoord, mine.ycoord);
    put({ x, y, type: 'mine', char: '.' });
  }

  // 1. Visible wormholes in this sector
  for (const wh of wormholes) {
    if (!wh.visible) continue;
    const { x, y } = project(wh.xcoord, wh.ycoord);
    put({ x, y, type: 'wormhole', char: 'W' });
  }

  // 3. Other ships in this sector (from scantab for letter assignment)
  for (const entry of scantab) {
    const other = allShips.find(s => `${s.userid}#${s.shipno}` === entry.shipKey);
    if (!other) continue;
    // Sector filter — only include ships in the same sector
    if (Math.floor(other.xcoord) !== xsect || Math.floor(other.ycoord) !== ysect) continue;

    const { x, y } = project(other.xcoord, other.ycoord);
    const colour: ScanCell['colour'] = scanShipColour(other.status);
    put({ x, y, type: 'ship', char: entry.letter, colour });
  }

  // 4. Self — GECMDS.C:2629-2632
  const selfPos = project(ship.xcoord, ship.ycoord);
  put({ x: selfPos.x, y: selfPos.y, type: 'self', char: '*', colour: 'self' });

  // 5. Planets LAST — `map_planets()` at GECMDS.C:2634, after the self-cell.
  // The glyph is the planet's index WITHIN THE SECTOR: `'1' + i`, so the
  // first planet here is '1' whatever its id. MAXPLANETS is 9 (GEMAIN.H:119),
  // so it never runs past '9'.
  for (const planet of planets) {
    const { x, y } = project(planet.xcoord, planet.ycoord);
    put({ x, y, type: 'planet', char: String(planet.plnum), colour: 'planet' });
  }

  const cells: ScanCell[] = Array.from(cellMap.values());

  const mode: ScanRenderEvent['mode'] = ship.scanHome ? 'overwrite' : 'append';
  const header = formatMessage(MessageId.SCAN25, xsect, ysect);

  return {
    lines: [{ text: header, category: 'info' }],
    scanRender: { kind: 'se', mode, cells, header },
  };
}
