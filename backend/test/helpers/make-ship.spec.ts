import { makeShip } from './make-ship';

describe('makeShip', () => {
  it('returns a ShipState with every field populated', () => {
    const ship = makeShip();
    expect(ship.userid).toBe('u1');
    expect(ship.shipno).toBe(1);
  });

  it('applies overrides over the defaults', () => {
    expect(makeShip({ shipname: 'Beta', damage: 40 })).toMatchObject({
      shipname: 'Beta',
      damage: 40,
      shipno: 1,
    });
  });

  it('gives each call its own arrays, so one test cannot mutate another', () => {
    const a = makeShip();
    const b = makeShip();
    a.freq.push(9);
    expect(b.freq).toEqual([0, 0, 0]);
  });

  it('defaults every domain-checked field inside its canon domain', () => {
    // These four are the fields test/invariants/fixture-domains.spec.ts guards.
    // topspeed is a warp FACTOR (real ships have 8, 10, 15), not raw units —
    // a topspeed of 8000 in fixtures once hid the Cybertron movement bug for
    // 339 commits. @see MBMGESHP.MSG S**WARP `N 0 255`
    const s = makeShip();
    expect(s.topspeed).toBeGreaterThanOrEqual(0);
    expect(s.topspeed).toBeLessThanOrEqual(255);
    expect(s.shpclass).toBeGreaterThanOrEqual(0);
    expect(s.shpclass).toBeLessThanOrEqual(41);
    expect(s.phasrtype).toBeGreaterThanOrEqual(0);
    expect(s.phasrtype).toBeLessThanOrEqual(20);
    expect(s.percent).toBeGreaterThanOrEqual(0);
    expect(s.percent).toBeLessThanOrEqual(99);
  });
});
