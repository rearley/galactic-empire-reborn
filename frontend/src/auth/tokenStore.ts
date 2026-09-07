const TOKEN_KEY = 'ge_jwt';

/**
 * Some browsers throw on any `localStorage` access rather than silently
 * no-op-ing — private/incognito modes in several engines, and Chrome with
 * third-party (or all) cookies/site data blocked. `SiteHeader` reads
 * `getToken()` on the public landing page, so a throwing store must not
 * blank the first screen a stranger sees. All three functions here
 * therefore swallow storage exceptions.
 */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * No-op when storage throws. Consequence: on a browser that blocks storage,
 * a visitor can still sign in and play for the life of the tab (the token
 * lives fine in memory wherever the caller holds it), but nothing persists
 * it — a reload loses the session and drops them back to login. That is a
 * deliberate degradation: worse than a normal session, but far better than
 * the crash an unguarded `setItem` would produce here.
 */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked — see comment above. Nothing to do.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Already inaccessible, so there is nothing to clear.
  }
}
