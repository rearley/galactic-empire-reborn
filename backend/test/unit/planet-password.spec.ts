import { resolvePlanetPassword } from '../../src/game/planet/planet-password';

/**
 * `adm password` stored the literal word and never touched the planet's
 * teamcode, so the whole team-access mechanism was inert — and worse,
 * `adm password team` from an owner with no team was accepted and stored
 * "team" as an ordinary password, letting anyone who typed that word land.
 *
 * C branches three ways (GEMAIN.C:3266-3290):
 *   "none"  -> teamcode = 0
 *   "team"  -> if (waruptr->teamcode > 0) plptr->teamcode = waruptr->teamcode
 *              else { plptr->teamcode = 0; plptr->password[0] = 0; }  // refused
 *   other   -> teamcode = 0, password kept as typed
 */
describe('resolvePlanetPassword', () => {
  it('clears the team lock on "none"', () => {
    expect(resolvePlanetPassword('none', 77n)).toEqual({
      password: 'none', teamcode: 0n, outcome: 'cleared',
    });
  });

  it('locks to the owner\'s team on "team"', () => {
    expect(resolvePlanetPassword('team', 77n)).toEqual({
      password: 'team', teamcode: 77n, outcome: 'team-set',
    });
  });

  it('REFUSES "team" from an owner with no team, clearing both', () => {
    // C wipes the password as well, so the planet is not left admitting
    // anyone who happens to type the word "team".
    expect(resolvePlanetPassword('team', 0n)).toEqual({
      password: '', teamcode: 0n, outcome: 'team-refused',
    });
    expect(resolvePlanetPassword('team', null)).toEqual({
      password: '', teamcode: 0n, outcome: 'team-refused',
    });
  });

  it('treats any other word as a plain password and drops the team lock', () => {
    expect(resolvePlanetPassword('hunter2', 77n)).toEqual({
      password: 'hunter2', teamcode: 0n, outcome: 'password-set',
    });
  });

  it('matches the keywords case-insensitively, as C\'s sameas does', () => {
    expect(resolvePlanetPassword('TEAM', 5n).outcome).toBe('team-set');
    expect(resolvePlanetPassword('None', 5n).outcome).toBe('cleared');
  });
});
