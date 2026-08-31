import { debugEndpointsEnabled } from '../../../src/debug/debug-endpoints';

/**
 * The debug controllers are cheat endpoints with NO authentication: they take a
 * *shipname*, so anyone who can reach the port could teleport another player's
 * ship, swap its hull class, zero its damage, hand themselves ordnance, set any
 * captain's credit balance, or spawn droids. `docker-compose.yml` does set
 * `NODE_ENV: production`, but the old gate was `NODE_ENV !== 'production'` —
 * which fails OPEN. A bare `node dist/src/main`, a systemd unit, or any host
 * that does not set NODE_ENV published the lot.
 *
 * So: off unless explicitly switched on, and never on in production even if the
 * switch is set.
 */
describe('debugEndpointsEnabled', () => {
  it('is off when nothing is configured', () => {
    expect(debugEndpointsEnabled({})).toBe(false);
  });

  it('is off when NODE_ENV is simply missing — the old failure mode', () => {
    expect(debugEndpointsEnabled({ DATABASE_URL: 'postgres://x' })).toBe(false);
  });

  it('is off in development unless asked for', () => {
    expect(debugEndpointsEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('is on when explicitly switched on outside production', () => {
    expect(debugEndpointsEnabled({ NODE_ENV: 'development', GE_DEBUG_ENDPOINTS: '1' })).toBe(true);
  });

  it('accepts the usual affirmative spellings', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(debugEndpointsEnabled({ GE_DEBUG_ENDPOINTS: value })).toBe(true);
    }
  });

  it('treats anything else as off rather than guessing', () => {
    for (const value of ['', '0', 'false', 'no', 'off', 'maybe']) {
      expect(debugEndpointsEnabled({ GE_DEBUG_ENDPOINTS: value })).toBe(false);
    }
  });

  it('refuses in production even when the switch is set', () => {
    expect(debugEndpointsEnabled({ NODE_ENV: 'production', GE_DEBUG_ENDPOINTS: '1' })).toBe(false);
    expect(debugEndpointsEnabled({ NODE_ENV: 'PRODUCTION', GE_DEBUG_ENDPOINTS: 'true' })).toBe(false);
  });

  it('stays off in a test run unless a test asks for it', () => {
    expect(debugEndpointsEnabled({ NODE_ENV: 'test' })).toBe(false);
  });
});
