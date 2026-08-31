import { buildPurchasedShipName } from '../../../src/game/commands/handlers/purchased-ship-name';

/**
 * Auto-generated hull names were `${typeName} #${shipno}` where `shipno` is the
 * captain's OWN monotonic counter, while `Ship_shipname_lower_idx` is a GLOBAL
 * unique index. Two captains buying their second Stealth Fighter both got
 * "Stealth Fighter #2", the insert hit P2002, and the second one saw
 * "Internal error processing command." — on a live server that lands the moment
 * a second player buys any class.
 *
 * C sidesteps this by naming every purchased hull " <NO NAME> " (GEFUNCS.C:194)
 * and expecting `ren`; it has no unique-name index. This port does, so the
 * generated name has to be able to step aside for one already taken.
 */
describe('buildPurchasedShipName', () => {
  it('is the class name and ship number on the first attempt', () => {
    expect(buildPurchasedShipName('Stealth Fighter', 2, 0)).toBe('Stealth Fighter #2');
  });

  it('produces a different name on each retry', () => {
    const names = [0, 1, 2, 3].map((n) => buildPurchasedShipName('Stealth Fighter', 2, n, 'usr_a'));
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * A fixed ladder of suffixes would only tolerate as many captains as it has
   * rungs: every captain's second Stealth Fighter is shipno 2, so they would all
   * walk the same short list and the sixth purchase would fail outright. The
   * alternatives have to differ per captain.
   */
  it('offers different alternatives to different captains', () => {
    const a = buildPurchasedShipName('Stealth Fighter', 2, 1, 'usr_alice');
    const b = buildPurchasedShipName('Stealth Fighter', 2, 1, 'usr_bob');
    expect(a).not.toBe(b);
  });

  it('is stable for the same captain and hull', () => {
    expect(buildPurchasedShipName('Interceptor', 3, 1, 'usr_alice'))
      .toBe(buildPurchasedShipName('Interceptor', 3, 1, 'usr_alice'));
  });

  it('never exceeds the 19-character limit that applies to player-chosen names', () => {
    // "Heavy Battle Cruiser" is already over on its own.
    for (let attempt = 0; attempt < 6; attempt++) {
      const name = buildPurchasedShipName('Heavy Battle Cruiser', 123, attempt, 'usr_someone');
      expect(name.length).toBeLessThanOrEqual(19);
    }
  });

  it('keeps the ship number legible even when the class name is truncated', () => {
    const name = buildPurchasedShipName('Heavy Battle Cruiser', 123, 0);
    expect(name).toContain('#123');
  });

  it('stays printable ASCII, like every other ship name', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(buildPurchasedShipName('Interceptor', 7, attempt, 'usr_x')).toMatch(/^[\x21-\x7E ]+$/);
    }
  });
});
