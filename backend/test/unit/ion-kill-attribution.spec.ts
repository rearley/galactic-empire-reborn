import {
  IONCANNON_LASTFIRED,
  ION_ATTRIBUTION_WINDOW_MS,
  attributePlanetKill,
} from '../../src/game/combat/planet-kill';

/**
 * A ship killed by a colony's ion cannons was announced to everyone watching
 * as "destroyed by unknown". `fireion` sets `lastfired = -1` (GEFUNCS.C:1796)
 * so no attacker resolves, and the destroyed event had no way to say a planet
 * did it — the same shape a self-destruct produces.
 *
 * The sentinel ALONE cannot be the evidence. This port uses -1 for
 * `NO_CHANNEL` too ("nobody has fired on me"), and ShipStateService resets a
 * victim's `lastfired` to it when the recorded firer leaves the game. Inferring
 * "a planet did this" from -1 would blame a colony for any death whose attacker
 * had disconnected. Attribution therefore requires a RECORDED ion hit on that
 * ship, recent enough to be the one that killed it.
 */
describe('attributePlanetKill', () => {
  const now = 1_000_000;

  it('documents that the sentinel is shared with NO_CHANNEL', () => {
    expect(IONCANNON_LASTFIRED).toBe(-1);
  });

  it('credits the planet when it hit the ship on this tick', () => {
    expect(attributePlanetKill({ hasAttackerShip: false, lastIonHitAt: now - 100, now })).toBe(true);
  });

  it('credits the planet for a hit one physics tick ago', () => {
    expect(attributePlanetKill({ hasAttackerShip: false, lastIonHitAt: now - 6_000, now })).toBe(true);
  });

  it('does not blame a planet for a death whose attacker merely disconnected', () => {
    // lastfired reset to NO_CHANNEL (-1) with no ion hit ever recorded.
    expect(attributePlanetKill({ hasAttackerShip: false, lastIonHitAt: null, now })).toBe(false);
  });

  it('does not blame a planet the ship escaped from long ago', () => {
    expect(
      attributePlanetKill({
        hasAttackerShip: false,
        lastIonHitAt: now - ION_ATTRIBUTION_WINDOW_MS - 1,
        now,
      }),
    ).toBe(false);
  });

  it('lets a ship take the kill when one actually fired', () => {
    // Someone shot the raider dead while the colony was also firing; the ship
    // gets the kill, exactly as lastfired attribution intends.
    expect(attributePlanetKill({ hasAttackerShip: true, lastIonHitAt: now - 100, now })).toBe(false);
  });
});
