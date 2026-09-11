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

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: GESTAT_USER, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  } as ShipState;
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
    const planet = { xcoord: 0.02, ycoord: 0.02, plnum: 7 } as unknown as import('@prisma/client').Planet;
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
});
