// @vitest-environment jsdom

/**
 * T028 — tokenStore: localStorage wrapper (TDD, intentionally failing until implementation).
 *
 * tokenStore.ts must export three functions:
 *   getToken()       → string | null
 *   setToken(token)  → void
 *   clearToken()     → void
 *
 * @see specs/011-onboarding/plan.md §tokenStore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// This import will fail until src/auth/tokenStore.ts is created.
import { getToken, setToken, clearToken } from '../../src/auth/tokenStore';

// Reset both localStorage AND the module-level in-memory fallback before
// every test in this file, regardless of which describe block it is in —
// setToken() now populates an in-memory variable in addition to
// localStorage, and that variable does not reset itself just because
// localStorage.clear() ran.
beforeEach(() => {
  localStorage.clear();
  clearToken();
});

describe('tokenStore', () => {

  it('getToken() returns null when nothing is stored', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken() then getToken() returns the stored token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
  });

  it('setToken() then clearToken() then getToken() returns null', () => {
    setToken('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('overwriting token with setToken() returns the new value', () => {
    setToken('first-token');
    setToken('second-token');
    expect(getToken()).toBe('second-token');
  });
});

describe('tokenStore when localStorage throws', () => {
  // Some browsers (private/incognito modes, Chrome with third-party or all
  // site data blocked) throw on any localStorage access rather than no-op.
  // SiteHeader reads getToken() on the public landing page, so a throwing
  // store must degrade gracefully rather than blank the screen.

  it('getToken() returns null rather than throwing when getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() => getToken()).not.toThrow();
    expect(getToken()).toBeNull();
    spy.mockRestore();
  });

  it('setToken() does not throw when setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() => setToken('abc')).not.toThrow();
    spy.mockRestore();
  });

  it('clearToken() does not throw when removeItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() => clearToken()).not.toThrow();
    spy.mockRestore();
  });
});

describe('tokenStore in-memory fallback', () => {
  // Regression guard for a real bug: setToken() no-oping when localStorage
  // throws meant nothing held the token anywhere. Register -> setToken
  // no-ops -> ChooseUsername reads null -> sends "Bearer " -> 401. Login ->
  // setToken no-ops -> /play -> RequireAuth bounces to /login. A silent loop
  // with no error shown. The fix keeps the token in a module-level variable
  // with localStorage as a write-through cache, so getToken() falls back to
  // the in-memory value when storage is blocked.

  it('getToken() returns the value set by setToken() even when every localStorage call throws', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    setToken('memory-only-token');
    expect(getToken()).toBe('memory-only-token');

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('overwriting the in-memory token replaces the previous value', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    setToken('first');
    setToken('second');
    expect(getToken()).toBe('second');

    setSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('clearToken() clears the in-memory fallback too, even when removeItem throws', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    setToken('to-be-cleared');
    clearToken();
    expect(getToken()).toBeNull();

    setSpy.mockRestore();
    getSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('getToken() prefers the in-memory value over a (stale) working localStorage', () => {
    // Write-through: setToken keeps localStorage and memory in sync in the
    // normal case, but if they ever disagree the in-memory value — set most
    // recently by this tab — must win over whatever storage happens to hold.
    setToken('current-token');
    localStorage.setItem('ge_jwt', 'stale-value-written-directly');
    expect(getToken()).toBe('current-token');
  });
});
