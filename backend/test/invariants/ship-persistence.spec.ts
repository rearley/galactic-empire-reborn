import {
  inMemoryShipMatchesDb,
  noOrphanShipState,
} from '../../src/game/invariants/ship-persistence.invariants';

const FAR_PAST = Date.now() - 60_000;

describe('inMemoryShipMatchesDb', () => {
  it('flags a field mismatch on a settled ship (lastFlushedAt past the Δ window)', () => {
    const world = {
      ships: [
        {
          shipId: 'A',
          lastFlushedAt: FAR_PAST,
          xcoord: 5,
          ycoord: 5,
          energy: 1000,
          damage: 0,
          shieldsUp: true,
          cargo: 0,
        },
      ],
      dbShips: {
        A: {
          xcoord: 5,
          ycoord: 5,
          energy: 999, // <- mismatch
          damage: 0,
          shieldsUp: true,
          cargo: 0,
          userExists: true,
        },
      },
    };

    const violations = inMemoryShipMatchesDb.run(world);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe('inMemoryShipMatchesDb');
    expect(violations[0].severity).toBe('HIGH');
    expect(violations[0].detail).toContain('energy');
  });

  /**
   * The whole job of this reporter is to say WHICH value drifted. `String(v)`
   * on an object renders `[object Object]`, so for a structured field — cargo
   * is the one in the list — the report named the field and then told you
   * nothing about either side, which is most of its usefulness. It is also the
   * failure mode where the diagnostic disappears exactly when it is needed.
   * @see issue #29
   */
  it('names both values for a structured field, never [object Object]', () => {
    const world = {
      ships: [
        {
          shipId: 'A',
          lastFlushedAt: FAR_PAST,
          xcoord: 5, ycoord: 5, energy: 1000, damage: 0, shieldsUp: true,
          cargo: { food: 10n, men: 2n },
        },
      ],
      dbShips: {
        A: {
          xcoord: 5, ycoord: 5, energy: 1000, damage: 0, shieldsUp: true,
          cargo: { food: 9n, men: 2n },
          userExists: true,
        },
      },
    };

    const violations = inMemoryShipMatchesDb.run(world);

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).not.toContain('[object Object]');
    expect(violations[0].detail).toContain('food');
    expect(violations[0].detail).toContain('10');
    expect(violations[0].detail).toContain('9');
  });

  it('passes when every field matches', () => {
    const world = {
      ships: [
        {
          shipId: 'A',
          lastFlushedAt: FAR_PAST,
          xcoord: 5,
          ycoord: 5,
          energy: 1000,
          damage: 0,
          shieldsUp: true,
          cargo: 0,
        },
      ],
      dbShips: {
        A: {
          xcoord: 5,
          ycoord: 5,
          energy: 1000,
          damage: 0,
          shieldsUp: true,
          cargo: 0,
          userExists: true,
        },
      },
    };

    expect(inMemoryShipMatchesDb.run(world)).toEqual([]);
  });

  it('skips ships flushed inside the Δ window (race-tolerant)', () => {
    const world = {
      ships: [
        {
          shipId: 'A',
          lastFlushedAt: Date.now(), // just now
          xcoord: 5,
          ycoord: 5,
          energy: 1000,
          damage: 0,
          shieldsUp: true,
          cargo: 0,
        },
      ],
      dbShips: {
        A: {
          xcoord: 99, // mismatch but inside settle window
          ycoord: 99,
          energy: 1,
          damage: 9,
          shieldsUp: false,
          cargo: 99,
          userExists: true,
        },
      },
    };

    expect(inMemoryShipMatchesDb.run(world)).toEqual([]);
  });

  it('returns no violations when dbShips slice is absent', () => {
    expect(
      inMemoryShipMatchesDb.run({ ships: [{ shipId: 'A', lastFlushedAt: FAR_PAST }] }),
    ).toEqual([]);
    expect(inMemoryShipMatchesDb.run({})).toEqual([]);
  });
});

describe('noOrphanShipState', () => {
  it('flags an in-memory ship with no corresponding User row', () => {
    const world = {
      ships: [{ shipId: 'A' }, { shipId: 'B' }],
      dbShips: {
        A: { userExists: true },
        B: { userExists: false }, // ghost — would have been kicked per commit 44ff93a
      },
    };

    const violations = noOrphanShipState.run(world);

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('noOrphanShipState');
    expect(violations[0].severity).toBe('HIGH');
    expect(violations[0].detail).toContain('B');
  });

  it('also flags a ship with no dbShips entry at all', () => {
    const world = {
      ships: [{ shipId: 'A' }],
      dbShips: {},
    };

    const violations = noOrphanShipState.run(world);
    expect(violations).toHaveLength(1);
  });

  it('passes when every in-memory ship has a User row', () => {
    const world = {
      ships: [{ shipId: 'A' }],
      dbShips: { A: { userExists: true } },
    };

    expect(noOrphanShipState.run(world)).toEqual([]);
  });

  it('returns no violations when dbShips slice is absent', () => {
    expect(noOrphanShipState.run({ ships: [{ shipId: 'A' }] })).toEqual([]);
    expect(noOrphanShipState.run({})).toEqual([]);
  });
});
