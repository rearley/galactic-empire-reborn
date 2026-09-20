import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchServerVersion } from '../src/hooks/useVersionCheck';

/**
 * Reading the server's build over HTTP.
 *
 * The hook itself is thin — subscribe to `connect`, call this, compare — so the
 * part worth pinning is this function, where the two ways it can silently lie
 * live: the browser cache, and a failed request being read as agreement.
 */
describe('fetchServerVersion', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns the version the server reports', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'v0.27.8 · 3fae5a4' }),
    }) as unknown as typeof fetch;

    expect(await fetchServerVersion()).toBe('v0.27.8 · 3fae5a4');
  });

  it('bypasses the HTTP cache', async () => {
    // /public/stats is served `Cache-Control: public, max-age=15`, and this
    // runs moments after a redeploy — a cached body would report the version
    // that was just replaced, which is the exact answer that makes the check
    // useless.
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'v0.27.8 · 3fae5a4' }),
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchServerVersion();

    expect(spy).toHaveBeenCalledWith('/public/stats', expect.objectContaining({ cache: 'no-store' }));
  });

  it('returns null when the request fails, rather than guessing', async () => {
    // A reconnect can race the server coming back. An unreachable /public/stats
    // must read as "unknown", never as "you are up to date" and never as a
    // spurious reload prompt.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    expect(await fetchServerVersion()).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchServerVersion()).toBeNull();
  });

  it('returns null when the payload carries no version', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commanders: 5 }),
    }) as unknown as typeof fetch;
    expect(await fetchServerVersion()).toBeNull();
  });
});
