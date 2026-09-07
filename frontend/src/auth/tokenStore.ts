const TOKEN_KEY = 'ge_jwt';

/**
 * Some browsers throw on any `localStorage` access rather than silently
 * no-op-ing — private/incognito modes in several engines, and Chrome with
 * third-party (or all) cookies/site data blocked. `SiteHeader` reads
 * `getToken()` on the public landing page, so a throwing store must not
 * blank the first screen a stranger sees.
 *
 * `localStorage` is a write-through CACHE on top of this module-level
 * variable, not the source of truth: `getToken()` returns the in-memory
 * value whenever one is present, falling back to storage only when this
 * module has not seen a token yet (e.g. a fresh tab that already has a
 * stored session). That is what makes the session actually work when
 * storage throws — with the old "no-op and hope" version, setToken()
 * silently discarded the token, so nothing held it anywhere: register then
 * ChooseUsername read null and sent `Bearer `, and login then /play bounced
 * straight back to /login. A silent loop with no error shown.
 *
 * Consequence of the write-through design: on a browser that blocks
 * storage, a visitor can sign in and play for the life of the tab (the
 * token lives in this variable), but nothing persists it — a reload loses
 * the session and drops them back to login. That is a deliberate
 * degradation: worse than a normal session, but far better than the crash
 * an unguarded `setItem` would produce, and far better than the silent
 * dead-end a no-op `setToken` produced.
 */
let inMemoryToken: string | null = null;

export function getToken(): string | null {
  if (inMemoryToken !== null) return inMemoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  inMemoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked — see module comment. The in-memory copy above is
    // what keeps the session usable for the life of this tab.
  }
}

export function clearToken(): void {
  inMemoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Already inaccessible, so there is nothing to clear.
  }
}
