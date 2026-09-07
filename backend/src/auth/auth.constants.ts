export const BCRYPT_COST = 12;

export const JWT_EXPIRES_IN = '30d';

/**
 * Pre-computed bcrypt hash used for constant-time dummy comparisons during
 * login to prevent user enumeration via timing attacks.
 * Hash of 'dummy-password' at cost factor 12.
 */
export const DUMMY_BCRYPT_HASH =
  '$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Vbpdb/07MNbN.GC';

/**
 * Rate limit window for /auth/* (register, login, username), applied per
 * caller per route by ThrottlerGuard on AuthController.
 *
 * bcrypt cost 12 is ~300ms on a libuv thread pool of 4, so ~15
 * unauthenticated requests/second saturates the process the 1-second game
 * tick runs on. 10 requests per 60 seconds per caller keeps sustained abuse
 * from any one source at roughly 1/6 req/s — far below that — while still
 * leaving room for a person who mistypes their password a few times in a
 * row without getting locked out.
 */
export const AUTH_THROTTLE_TTL_MS = 60_000;
export const AUTH_THROTTLE_LIMIT = 10;
