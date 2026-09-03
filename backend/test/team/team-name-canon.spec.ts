/**
 * Team names and passwords TRUNCATE at the canon field width; they never refuse.
 *
 * `cmd_team`'s create path is `strncpy(tmp.secret, margv[3], 10)`,
 * `strncpy(tmp.password, margv[4], 10)`, `strncpy(tmp.teamname, margv[5], 30)`
 * (GECMDS.C:5517-5521), and `newname` is `strncpy(teamtab[i].teamname,
 * margv[3], 30)` (GECMDS.C:5750). The struct is `teamname[31]`,
 * `password[11]`, `secret[11]` (GEMAIN.H:647-651), so the usable widths are
 * 30 and 10. Nowhere in cmd_team is a name or password rejected for length.
 *
 * The port refused both, and capped the password at 8 rather than 10 — so two
 * commands a 1994 player could type were errors here.
 */
import { parseTeaArgs, validateName, validatePassword } from '../../src/game/team/team-name';
import { MAX_TEAMNAME_LENGTH, MAX_TEAM_PASSWORD_LENGTH } from '../../src/game/team/team.types';

describe('team name and password widths', () => {
  it('matches the canon struct: teamname[31] and password[11]', () => {
    expect(MAX_TEAMNAME_LENGTH).toBe(30);
    expect(MAX_TEAM_PASSWORD_LENGTH).toBe(10);
  });

  it('truncates an over-long name at parse time instead of erroring', () => {
    const parsed = parseTeaArgs(['A'.repeat(45), 'pw']);
    expect('error' in parsed).toBe(false);
    expect((parsed as { name: string }).name).toBe('A'.repeat(30));
  });

  it('truncates an over-long password at parse time', () => {
    const parsed = parseTeaArgs(['Vipers', 'P'.repeat(20)]);
    expect((parsed as { password: string }).password).toBe('P'.repeat(10));
  });

  it('accepts a 10-character password, which canon allows and the port refused', () => {
    expect(validatePassword('P'.repeat(10))).toBeNull();
  });

  it('no longer refuses a long name', () => {
    expect(validateName('A'.repeat(45))).toBeNull();
  });

  it('still refuses a password containing whitespace', () => {
    // Canon tokenises on whitespace, so this is unreachable by typing there;
    // our input path is not guaranteed to be, so the guard stays.
    expect(validatePassword('bad pw')).toBe('password_has_space');
  });
});
