/**
 * Reads the username out of a JWT payload.
 *
 * This does NOT verify the signature and must never be trusted for
 * authorisation — the server re-verifies every token. It exists only to route:
 * knowing whether signup is finished decides which screen to show, and asking
 * the server for that on every navigation would be a round trip for a decision
 * the token already carries.
 */

/**
 * Decodes the JWT payload, or null if the token is missing/malformed
 * (wrong segment count, invalid base64url, or non-JSON body).
 *
 * Kept separate from `decodeUsername` because a malformed token and a valid
 * token with an explicit `username: null` both need to yield "no username" —
 * but they route differently: a malformed token means the visitor has no
 * usable session at all (send to /login), while a valid token with no
 * username belongs to an account that started registration and stopped
 * (send to /register/name). `RequireAuth` needs to tell those apart.
 */
function decodePayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = atob(segments[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    // Malformed token: treat as unauthenticated rather than crashing the app.
    return null;
  }
}

export function decodeUsername(token: string | null): string | null {
  const payload = decodePayload(token);
  if (!payload) return null;
  return typeof payload.username === 'string' && payload.username.length > 0
    ? payload.username
    : null;
}

export function hasUsername(token: string | null): boolean {
  return decodeUsername(token) !== null;
}

/** True only if the token has three JWT segments and a parseable JSON payload. */
export function isValidToken(token: string | null): boolean {
  return decodePayload(token) !== null;
}
