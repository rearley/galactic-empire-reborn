import { configureHttpSecurity, TRUST_PROXY } from '../../src/http-security';

/**
 * The auth rate limiter must see the CALLER's address, not nginx's.
 *
 * `@nestjs/throttler`'s default tracker is `req.ip`. Express's `trust proxy`
 * defaults to false, and production runs behind Plesk's nginx proxying to
 * 127.0.0.1:3000 (docs/DEPLOYMENT.md), so `req.ip` was the loopback address for
 * every visitor on earth — one shared bucket of 10 requests a minute.
 *
 * `ThrottlerStorageService.increment` counts the requests it is about to
 * reject and only decrements a full TTL after recording, so a single host
 * sending ~11 logins a minute keeps the bucket saturated indefinitely and
 * nobody else can log in or register. Unauthenticated, one host, negligible
 * cost. Found by the 2026-09-09 security review (M5).
 *
 * 'loopback' and NOT `true`: trusting the whole chain would let anyone set
 * `X-Forwarded-For` and pick their own bucket, which is no better than sharing
 * one. Only the hop we actually run is trusted.
 * @see docs/audits/2026-09-09-security-review.md
 */
describe('trust proxy', () => {
  it('trusts exactly one hop, the local reverse proxy', () => {
    const calls: [string, unknown][] = [];
    configureHttpSecurity({ set: (k: string, v: unknown) => { calls.push([k, v]); } });

    expect(calls).toContainEqual(['trust proxy', 'loopback']);
  });

  it('does not blanket-trust X-Forwarded-For', () => {
    // `true` would make the tracker attacker-controlled: a spoofable bucket is
    // as useless as a shared one.
    expect(TRUST_PROXY).not.toBe(true);
    expect(TRUST_PROXY).toBe('loopback');
  });
});
