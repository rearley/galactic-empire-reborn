import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../../../src/game/player/roster-query';

describe('ROSTER_WHERE', () => {
  it('lists only players who have actually scored', () => {
    // GECMDS.C:4038 — tmpusr.score > 0. Without it every dormant account pads
    // the board, which is what filled the roster with e2e_* rows.
    expect(ROSTER_WHERE.score).toEqual({ gt: 0n });
  });

  it('excludes Cybertrons, droids, and every @-prefixed userid', () => {
    const json = JSON.stringify(ROSTER_WHERE, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(json).toContain('Cybrg-');
    expect(json).toContain('@Droid-');
    expect(json).toContain('"startsWith":"@"');
  });
});

describe('ROSTER_ORDER_BY', () => {
  it('orders by score, then kills, then userid — deterministic on ties', () => {
    expect(ROSTER_ORDER_BY).toEqual([
      { score: 'desc' },
      { kills: 'desc' },
      { userid: 'asc' },
    ]);
  });
});
