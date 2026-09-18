import { isSysopUsername } from '../../src/auth/sysop';

/**
 * Sysop identity is answered from the DATABASE, not from the token.
 *
 * The JWT carries `username`, and it lasts 30 days (`JWT_EXPIRES_IN`). The
 * claim is `null` for an account that had not finished step 2 of registration
 * when the token was minted, so a month-old token can say a sysop is nobody —
 * silently, until they happen to log in again. Authorization must not depend on
 * a stale copy of a name.
 *
 * Reported from play as the link appearing and then not: "it kinda worked where
 * I saw report, clicked on it, clicked play and it was gone again. even hard
 * refreshed." The proximate cause there was an allowlist change, but the same
 * symptom is exactly what a stale claim produces, and one of the two was fixable.
 */
describe('isSysopUsername', () => {
  const env = { GE_SYSOP_USERNAME: 'rick, Wasp ' };

  it('matches the DISPLAY NAME, case-insensitively', () => {
    expect(isSysopUsername('rick', env)).toBe(true);
    expect(isSysopUsername('RICK', env)).toBe(true);
    expect(isSysopUsername('Wasp', env)).toBe(true);
  });

  it('is not the email and not the internal userid', () => {
    // `userid` is usr_<hex>, minted at registration and different after every
    // database reset, so it could never be configured ahead of time.
    expect(isSysopUsername('usr_2f6c1d9b8a7e', env)).toBe(false);
    expect(isSysopUsername('someone@example.invalid', env)).toBe(false);
  });

  it('refuses when the name is missing, which is what a stale token gives', () => {
    expect(isSysopUsername(null, env)).toBe(false);
    expect(isSysopUsername(undefined, env)).toBe(false);
    expect(isSysopUsername('', env)).toBe(false);
  });

  it('fails closed when nobody is configured', () => {
    expect(isSysopUsername('rick', {})).toBe(false);
    expect(isSysopUsername('rick', { GE_SYSOP_USERNAME: '' })).toBe(false);
    expect(isSysopUsername('rick', { GE_SYSOP_USERNAME: ' , ' })).toBe(false);
  });
});
