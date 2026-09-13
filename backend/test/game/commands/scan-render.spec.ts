/**
 * Unit tests for the pure scan-render helpers extracted from
 * `scan.handler.ts` (Task 7 of the Phase-2 restructure). These exercise the
 * functions directly rather than through `ScanHandlerService`, since they no
 * longer own any state (scantab stays on the service) — see
 * `.superpowers/sdd/2026-09-11-restructure-phase-2-gateway-split/task-7-report.md`.
 */
import {
  projectAllShips,
  buildSidePanel,
  renderLoScan,
  renderLoFullScan,
  renderSectorScan,
} from '../../../src/game/commands/handlers/scan/scan-render';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { GESTAT_AUTO, GESTAT_USER } from '../../../src/game/constants';
import { Scantab } from '../../../src/game/commands/handlers/helpers/scantab';
import { MineState, MINE_SLOT_FREE } from '../../../src/game/combat/mine.registry';
import { makeShip as buildShip } from '../../helpers/make-ship';

// Local defaults layered on the shared factory: this suite's ships sit at a
// fixed sub-sector position, stationary (topspeed 0) and boarded (GESTAT_USER).
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return buildShip({
    xcoord: 0.5,
    ycoord: 0.5,
    status: GESTAT_USER,
    topspeed: 0,
    ...overrides,
  });
}

describe('projectAllShips', () => {
  // projectRangeCell (constants.ts) treats `scanRange` as RAW units — it
  // divides by 10000 internally — so a realistic in-range projection needs a
  // raw-unit magnitude, not a bare sector delta.
  const PROJECTION_RANGE = 100_000;

  it('projects every ship in range, gated by nothing (no scantab requirement)', () => {
    const self = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
    const contact = makeShip({ userid: 'u2', shipno: 1, xcoord: 0, ycoord: 1, status: GESTAT_AUTO });
    const cells = projectAllShips(self, [self, contact], [], PROJECTION_RANGE);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ type: 'ship', char: '+' });
  });

  it('uses the scantab letter over the raw AI/manual glyph when resolved', () => {
    const self = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
    const contact = makeShip({ userid: 'u2', shipno: 1, xcoord: 0, ycoord: 1, status: GESTAT_AUTO });
    const scantab: Scantab = [
      { shipKey: 'u2#1', dist: 1000, letter: 'A', bearing: 0, heading: 0, speed: 0, flag: 1 },
    ];
    const cells = projectAllShips(self, [self, contact], scantab, PROJECTION_RANGE);
    expect(cells[0]).toMatchObject({ type: 'ship', char: 'A' });
  });
});

describe('buildSidePanel', () => {
  it('includes a name row only when scanNames is set', () => {
    const other = makeShip({ userid: 'u2', shipno: 1, shipname: 'Bandit' });
    const scantab: Scantab = [
      { shipKey: 'u2#1', dist: 12345, letter: 'A', bearing: 90, heading: 45, speed: 1000, flag: 1 },
    ];
    const withoutNames = buildSidePanel(makeShip({ scanNames: false }), scantab, [other]);
    expect(withoutNames[0].name).toBeUndefined();

    const withNames = buildSidePanel(makeShip({ scanNames: true }), scantab, [other]);
    expect(withNames[0].name).toBe('Bandit');
  });

  it('truncates the raw distance rather than dividing it', () => {
    const other = makeShip({ userid: 'u2', shipno: 1 });
    const scantab: Scantab = [
      { shipKey: 'u2#1', dist: 14900.7, letter: 'A', bearing: 0, heading: 0, speed: 0, flag: 1 },
    ];
    const rows = buildSidePanel(makeShip(), scantab, [other]);
    expect(rows[0].distance).toBe(14900);
  });
});

describe('renderLoScan', () => {
  it('projects at 10x scanRange and places the self-cell at grid centre', () => {
    const ship = makeShip({ xcoord: 3, ycoord: 4 });
    const result = renderLoScan(ship, 100_000, [ship], []);
    expect(result.scanRender?.kind).toBe('lo');
    const self = result.scanRender?.cells.find((c) => c.type === 'self');
    expect(self).toMatchObject({ x: 15, y: 7, char: '*' });
  });

  it('never draws planets on the long-range overview', () => {
    const ship = makeShip();
    const result = renderLoScan(ship, 100_000, [ship], []);
    expect(result.scanRender?.cells.some((c) => c.type === 'planet')).toBe(false);
  });
});

describe('renderLoFullScan', () => {
  it('produces a lo-full render with an empty lines array (the SCAN DATA card carries the header)', () => {
    const ship = makeShip();
    const result = renderLoFullScan(ship, 100_000, [ship], []);
    expect(result.lines).toEqual([]);
    expect(result.scanRender?.kind).toBe('lo-full');
    expect(result.scanRender?.sidePanel).toEqual([]);
  });
});

describe('renderSectorScan', () => {
  it('draws planets LAST so a planet overwrites a ship/self sharing its cell', () => {
    const ship = makeShip({ xcoord: 0.02, ycoord: 0.02 });
    const planet = { xcoord: 0.02, ycoord: 0.02, plnum: 7 } as unknown as import('../../../src/prisma/client').Planet;
    const result = renderSectorScan(ship, [ship], [], [], [], [planet]);
    const cellsAtSelf = result.scanRender?.cells.filter((c) => c.x === 0 && c.y === 0);
    expect(cellsAtSelf).toHaveLength(1);
    expect(cellsAtSelf?.[0]).toMatchObject({ type: 'planet', char: '7' });
  });

  it('draws live mines in the current sector, in a cell distinct from self', () => {
    const ship = makeShip({ xcoord: 0.1, ycoord: 0.1 });
    const mines: MineState[] = [
      { channel: 1, xcoord: 0.9, ycoord: 0.9 } as unknown as MineState,
      { channel: MINE_SLOT_FREE, xcoord: 0.9, ycoord: 0.9 } as unknown as MineState,
    ];
    const result = renderSectorScan(ship, [ship], [], mines, [], []);
    const mineCells = result.scanRender?.cells.filter((c) => c.type === 'mine');
    expect(mineCells).toHaveLength(1);
  });

  /**
   * Canon's write order — mines '.' -> wormholes 'W' (ours) -> ships (letter)
   * -> self '*' -> map_planets() LAST (GECMDS.C:2598-2634, plus the wormhole
   * insertion this port adds ahead of the self-cell). Each test below
   * colocates exactly the ADJACENT pair in that order on one grid cell — the
   * self ship is parked on a DIFFERENT cell (0.5,0.5 -> grid (15,7)) so it
   * never contaminates a pair that doesn't involve it.
   *
   * A reordered `put()` call is exactly the risk this pins: swapping the
   * ship and wormhole loops, or moving the self-cell write before the ship
   * loop, changes which glyph a player sees when two objects share a cell,
   * and no other test in this file (or `scan-se-gateway.spec.ts`) would catch
   * it, because none of them colocate two draw types on the same cell.
   */
  describe('draw-order precedence chain: mine -> wormhole -> ship -> self -> planet', () => {
    // A colocation cell distinct from the self ship's own (15,7) cell below.
    const CO_X = 0.02;
    const CO_Y = 0.02;

    it('a wormhole overwrites a mine on the same cell', () => {
      const self = makeShip({ xcoord: 0.5, ycoord: 0.5 });
      const mines: MineState[] = [{ channel: 1, xcoord: CO_X, ycoord: CO_Y } as unknown as MineState];
      const wormholes = [{ xcoord: CO_X, ycoord: CO_Y, visible: true }];
      const result = renderSectorScan(self, [self], [], mines, wormholes, []);
      const cellsAt00 = result.scanRender?.cells.filter((c) => c.x === 0 && c.y === 0);
      expect(cellsAt00).toHaveLength(1);
      expect(cellsAt00?.[0]).toMatchObject({ type: 'wormhole', char: 'W' });
    });

    it('a ship overwrites a wormhole on the same cell', () => {
      const self = makeShip({ userid: 'u1', shipno: 1, xcoord: 0.5, ycoord: 0.5 });
      const other = makeShip({ userid: 'u2', shipno: 1, xcoord: CO_X, ycoord: CO_Y, status: GESTAT_AUTO });
      const scantab: Scantab = [
        { shipKey: 'u2#1', dist: 100, letter: 'A', bearing: 0, heading: 0, speed: 0, flag: 1 },
      ];
      const wormholes = [{ xcoord: CO_X, ycoord: CO_Y, visible: true }];
      const result = renderSectorScan(self, [self, other], scantab, [], wormholes, []);
      const cellsAt00 = result.scanRender?.cells.filter((c) => c.x === 0 && c.y === 0);
      expect(cellsAt00).toHaveLength(1);
      expect(cellsAt00?.[0]).toMatchObject({ type: 'ship', char: 'A' });
    });

    it('the self cell overwrites a ship on the same cell', () => {
      // The self ship itself sits on the colocation cell here (rather than at
      // its own separate (15,7) spot), so self and another ship share (0,0).
      const self = makeShip({ userid: 'u1', shipno: 1, xcoord: CO_X, ycoord: CO_Y });
      const other = makeShip({ userid: 'u2', shipno: 1, xcoord: CO_X, ycoord: CO_Y, status: GESTAT_AUTO });
      const scantab: Scantab = [
        { shipKey: 'u2#1', dist: 100, letter: 'A', bearing: 0, heading: 0, speed: 0, flag: 1 },
      ];
      const result = renderSectorScan(self, [self, other], scantab, [], [], []);
      const cellsAt00 = result.scanRender?.cells.filter((c) => c.x === 0 && c.y === 0);
      expect(cellsAt00).toHaveLength(1);
      expect(cellsAt00?.[0]).toMatchObject({ type: 'self', char: '*' });
    });

    it('a planet overwrites the self cell on the same cell', () => {
      const self = makeShip({ xcoord: CO_X, ycoord: CO_Y });
      const planet = { xcoord: CO_X, ycoord: CO_Y, plnum: 3 } as unknown as import('../../../src/prisma/client').Planet;
      const result = renderSectorScan(self, [self], [], [], [], [planet]);
      const cellsAt00 = result.scanRender?.cells.filter((c) => c.x === 0 && c.y === 0);
      expect(cellsAt00).toHaveLength(1);
      expect(cellsAt00?.[0]).toMatchObject({ type: 'planet', char: '3' });
    });
  });
});
