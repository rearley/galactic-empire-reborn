import { buildScantab, Scantab, ScantabEntry } from '../../src/game/commands/handlers/helpers/scantab';
import { ShipState } from '../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

const SELF = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
const SCAN_RANGE = 100_000; // large range so most tests include all ships

describe('buildScantab', () => {
  test('T1: lazy init from prev=null — one ship in range returns entry with letter A', () => {
    const other = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const result = buildScantab(SELF, [SELF, other], null, SCAN_RANGE);
    expect(result).toHaveLength(1);
    expect(result[0].letter).toBe('A');
    expect(result[0].flag).toBe(1);
    expect(result[0].shipKey).toBe('u2#1');
  });

  test('T2: letter stickiness — ship keeps same letter on second scan', () => {
    const other = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const scan1 = buildScantab(SELF, [SELF, other], null, SCAN_RANGE);
    expect(scan1[0].letter).toBe('A');

    const scan2 = buildScantab(SELF, [SELF, other], scan1, SCAN_RANGE);
    expect(scan2).toHaveLength(1);
    expect(scan2[0].letter).toBe('A');
    expect(scan2[0].shipKey).toBe('u2#1');
  });

  test('T3: cloaked exclusion — ship with cloak >= 10 is excluded', () => {
    const cloaked = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0, cloak: 10 });
    const result = buildScantab(SELF, [SELF, cloaked], null, SCAN_RANGE);
    expect(result).toHaveLength(0);
  });

  test('T3b: ship with cloak < 10 is included', () => {
    const visible = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0, cloak: 9 });
    const result = buildScantab(SELF, [SELF, visible], null, SCAN_RANGE);
    expect(result).toHaveLength(1);
  });

  test('T4: out-of-range exclusion — ship beyond scanRange is excluded', () => {
    // dist = sqrt(10^2 + 0^2) * 10000 = 100000
    const far = makeShip({ userid: 'u2', shipno: 1, xcoord: 10, ycoord: 0 });
    const smallRange = 99_999; // just under 100000
    const result = buildScantab(SELF, [SELF, far], null, smallRange);
    expect(result).toHaveLength(0);
  });

  test('T4b: ship exactly at range boundary is excluded (dist >= scanRange)', () => {
    // dist = sqrt(10^2 + 0^2) * 10000 = 100000
    const atBoundary = makeShip({ userid: 'u2', shipno: 1, xcoord: 10, ycoord: 0 });
    const exactRange = 100_000;
    const result = buildScantab(SELF, [SELF, atBoundary], null, exactRange);
    expect(result).toHaveLength(0);
  });

  test('T5: self exclusion — self ship is excluded', () => {
    const result = buildScantab(SELF, [SELF], null, SCAN_RANGE);
    expect(result).toHaveLength(0);
  });

  test('T5b: self exclusion uses userid+shipno identity', () => {
    // Different userid same shipno — not self
    const notSelf = makeShip({ userid: 'other', shipno: 1, xcoord: 1, ycoord: 0 });
    const result = buildScantab(SELF, [SELF, notSelf], null, SCAN_RANGE);
    expect(result).toHaveLength(1);
  });

  test('T6: A..Z order by distance — nearest gets A, middle B, farthest C', () => {
    // raw distances: sqrt(3^2)*10000=30000, sqrt(1^2)*10000=10000, sqrt(2^2)*10000=20000
    const shipA = makeShip({ userid: 'u2', shipno: 1, xcoord: 3, ycoord: 0 }); // dist 30000
    const shipB = makeShip({ userid: 'u3', shipno: 1, xcoord: 1, ycoord: 0 }); // dist 10000
    const shipC = makeShip({ userid: 'u4', shipno: 1, xcoord: 2, ycoord: 0 }); // dist 20000
    const result = buildScantab(SELF, [SELF, shipA, shipB, shipC], null, SCAN_RANGE);
    expect(result).toHaveLength(3);
    // result is sorted by dist ascending
    expect(result[0].shipKey).toBe('u3#1'); // nearest
    expect(result[0].letter).toBe('A');
    expect(result[1].shipKey).toBe('u4#1'); // middle
    expect(result[1].letter).toBe('B');
    expect(result[2].shipKey).toBe('u2#1'); // farthest
    expect(result[2].letter).toBe('C');
  });

  test('T7: 26-cap — with 30 qualifying ships, result has exactly 26 entries (the 26 nearest)', () => {
    // ships at x=1..30, y=0 — distances 10000..300000 raw
    // Use a large scan range so all 30 ships are in range, confirming the 26-cap kicks in
    const LARGE_RANGE = 10_000_000;
    const ships: ShipState[] = Array.from({ length: 30 }, (_, i) =>
      makeShip({ userid: `u${i + 2}`, shipno: 1, xcoord: i + 1, ycoord: 0 })
    );
    const result = buildScantab(SELF, [SELF, ...ships], null, LARGE_RANGE);
    expect(result).toHaveLength(26);
    // farthest included is x=26 (dist 260000), x=27..30 excluded
    const keys = result.map(e => e.shipKey);
    expect(keys).toContain('u2#1');   // x=1, nearest
    expect(keys).toContain('u27#1'); // x=26, 26th nearest
    expect(keys).not.toContain('u28#1'); // x=27, 27th ship excluded by cap
  });

  test('T8: immutability — prev is not mutated by buildScantab', () => {
    const other = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const scan1 = buildScantab(SELF, [SELF, other], null, SCAN_RANGE);
    const prevCopy: ScantabEntry[] = JSON.parse(JSON.stringify(scan1));

    // Add a second ship and re-scan
    const other2 = makeShip({ userid: 'u3', shipno: 1, xcoord: 2, ycoord: 0 });
    buildScantab(SELF, [SELF, other, other2], scan1, SCAN_RANGE);

    // scan1 should be unchanged
    expect(scan1).toHaveLength(prevCopy.length);
    expect(scan1[0]).toEqual(prevCopy[0]);
  });

  test('T9: new ship gets new letter, existing ship keeps its letter', () => {
    const shipA = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const scan1 = buildScantab(SELF, [SELF, shipA], null, SCAN_RANGE);
    expect(scan1[0].letter).toBe('A');

    // Add shipB at farther distance
    const shipB = makeShip({ userid: 'u3', shipno: 1, xcoord: 2, ycoord: 0 });
    const scan2 = buildScantab(SELF, [SELF, shipA, shipB], scan1, SCAN_RANGE);

    const entryA = scan2.find(e => e.shipKey === 'u2#1');
    const entryB = scan2.find(e => e.shipKey === 'u3#1');
    expect(entryA?.letter).toBe('A'); // sticky
    expect(entryB?.letter).toBe('B'); // next available
  });

  test('T10: available letters fill in order — gaps from stickiness filled from lowest available', () => {
    // First scan: ships at positions 1, 2, 3 get A, B, C
    const ship1 = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const ship2 = makeShip({ userid: 'u3', shipno: 1, xcoord: 2, ycoord: 0 });
    const ship3 = makeShip({ userid: 'u4', shipno: 1, xcoord: 3, ycoord: 0 });
    const scan1 = buildScantab(SELF, [SELF, ship1, ship2, ship3], null, SCAN_RANGE);
    expect(scan1.map(e => e.letter)).toEqual(['A', 'B', 'C']);

    // Second scan: ship2 (B) disappears, new ship4 arrives at x=4
    const ship4 = makeShip({ userid: 'u5', shipno: 1, xcoord: 4, ycoord: 0 });
    const scan2 = buildScantab(SELF, [SELF, ship1, ship3, ship4], scan1, SCAN_RANGE);

    const e1 = scan2.find(e => e.shipKey === 'u2#1')!;
    const e3 = scan2.find(e => e.shipKey === 'u4#1')!;
    const e4 = scan2.find(e => e.shipKey === 'u5#1')!;

    expect(e1.letter).toBe('A'); // sticky
    expect(e3.letter).toBe('C'); // sticky
    expect(e4.letter).toBe('B'); // B was freed, gets assigned to new ship
  });

  test('T11: dist field is correct raw units (Euclidean * 10000)', () => {
    // xcoord=3, ycoord=4 -> sqrt(9+16)=5 -> 50000
    const other = makeShip({ userid: 'u2', shipno: 1, xcoord: 3, ycoord: 4 });
    const result = buildScantab(SELF, [SELF, other], null, SCAN_RANGE);
    expect(result[0].dist).toBeCloseTo(50_000, 0);
  });

  test('T12: bearing calculation matches C source formula', () => {
    // ship directly to the right (positive x): atan2(dx=1, dy=0) = PI/2 = 90 degrees
    const right = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0 });
    const result = buildScantab(SELF, [SELF, right], null, SCAN_RANGE);
    expect(result[0].bearing).toBe(90);
  });

  test('T13: heading and speed are copied from the other ship', () => {
    const other = makeShip({ userid: 'u2', shipno: 1, xcoord: 1, ycoord: 0, heading: 135, speed: 7 });
    const result = buildScantab(SELF, [SELF, other], null, SCAN_RANGE);
    expect(result[0].heading).toBe(135);
    expect(result[0].speed).toBe(7);
  });
});
