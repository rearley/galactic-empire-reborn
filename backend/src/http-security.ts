/**
 * How much of the forwarding chain Express may believe.
 *
 * `loopback`, not `true`. `@nestjs/throttler` keys its buckets on `req.ip`, and
 * with `trust proxy` off — Express's default, and what this app shipped with —
 * `req.ip` behind the panel's nginx is 127.0.0.1 for every visitor on earth: one
 * shared bucket of AUTH_THROTTLE_LIMIT requests a minute, so any single host
 * could keep it saturated and lock everyone out of login and registration.
 *
 * Trusting the whole chain instead would be no better: `X-Forwarded-For` is
 * caller-supplied, so an attacker could pick a fresh bucket per request. Only
 * the hop we actually operate is trusted.
 *
 * @see docs/audits/2026-09-09-security-review.md M5
 * @see docs/DEPLOYMENT.md — nginx terminates TLS and proxies to 127.0.0.1
 */
export const TRUST_PROXY = 'loopback' as const;

/** The minimal surface `configureHttpSecurity` needs — Express's `set`. */
export interface HttpSecurityTarget {
  set(setting: string, value: unknown): void;
}

/**
 * Apply HTTP-layer security settings to the underlying Express instance.
 * Separated from `bootstrap()` so it can be tested; `main.ts` is otherwise
 * unreachable from a unit test.
 */
export function configureHttpSecurity(app: HttpSecurityTarget): void {
  app.set('trust proxy', TRUST_PROXY);
}
