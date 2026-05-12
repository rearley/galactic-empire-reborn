import { scanRangeMatchesScanType } from '../../src/game/invariants/scanners.invariants';

describe('scanRangeMatchesScanType', () => {
  it('flags a short-scan result revealing a cell beyond scanRange', () => {
    const world = {
      scanResults: [
        {
          scanType: 'sca',
          scanner: { x: 0, y: 0 },
          scanRange: 100_000,
          // distance ~10 sectors but scanType=sca caps at scanRange (raw 100k -> 10 sectors)
          // sca is the short scan — distance must be ≤ scanRange (in coord units).
          revealed: [{ x: 50, y: 0 }],
        },
      ],
    };

    const violations = scanRangeMatchesScanType.run(world);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe('scanRangeMatchesScanType');
    expect(violations[0].severity).toBe('HIGH');
  });

  it('passes a sca lo result where every revealed cell is within projection range', () => {
    // sca lo projects at scanRange × SCAN_LO_PROJECTION_MULTIPLIER / 10000 sectors.
    // scanRange=100000, multiplier=3 → 30-sector radius.
    const world = {
      scanResults: [
        {
          scanType: 'sca lo',
          scanner: { x: 0, y: 0 },
          scanRange: 100_000,
          revealed: [
            { x: 5, y: 5 },
            { x: 9, y: 0 },
          ],
        },
      ],
    };

    expect(scanRangeMatchesScanType.run(world)).toEqual([]);
  });

  it('flags a sca lo result revealing a cell beyond the projection radius', () => {
    const world = {
      scanResults: [
        {
          scanType: 'sca lo',
          scanner: { x: 0, y: 0 },
          // scanRange=10000, multiplier=3 → projection radius = 3 sectors.
          // Revealed cell at 99,99 → ~140 sectors → must fail.
          scanRange: 10_000,
          revealed: [{ x: 99, y: 99 }],
        },
      ],
    };

    expect(scanRangeMatchesScanType.run(world).length).toBeGreaterThan(0);
  });

  it('skips sca ra (range scan) — complex projection deferred', () => {
    // S-003 — sca ra range = scanRange/((10-x)^2 * 10000); too complex for a runtime invariant.
    const world = {
      scanResults: [
        {
          scanType: 'sca ra',
          scanner: { x: 0, y: 0 },
          scanRange: 100_000,
          revealed: [{ x: 99, y: 99 }],
        },
      ],
    };

    expect(scanRangeMatchesScanType.run(world)).toEqual([]);
  });

  it('returns no violations on a missing snapshot slice', () => {
    expect(scanRangeMatchesScanType.run({})).toEqual([]);
  });
});
