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

import { describe, it, expect, beforeEach } from 'vitest';
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
