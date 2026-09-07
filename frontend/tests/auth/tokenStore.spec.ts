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

describe('tokenStore', () => {
  beforeEach(() => {
    // Reset localStorage between tests so they are fully isolated.
    localStorage.clear();
  });

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
