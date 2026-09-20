import { warn } from '../../scripts/deploy-warn.mjs';

/**
 * The watchtower pre-update hook.
 *
 * Watchtower BLOCKS on this command before stopping the container, which is the
 * whole reason the 45-second countdown can be honest — CI knows an image
 * exists, but only this knows the restart is happening now.
 *
 * Everything here must fail open. A courtesy notice must never be the reason a
 * deploy stalls.
 */
const okResponse = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

describe('deploy-warn pre-update hook', () => {
  it('posts the imminent phase to the local server with the ops token', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 1, countdownSeconds: 45 })));
    const sleep = vi.fn(() => Promise.resolve());

    await warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok', PORT: '3000' } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/admin/deploy/notice');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ phase: 'imminent' });
  });

  it('holds the deploy open for exactly the countdown the server asked for', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 2, countdownSeconds: 45 })));
    const sleep = vi.fn(() => Promise.resolve());

    await warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } });

    expect(sleep).toHaveBeenCalledWith(45_000);
  });

  it('does not sleep at all when nobody is in-game', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse({ notified: 0, countdownSeconds: 0 })));
    const sleep = vi.fn(() => Promise.resolve());

    await warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the server is unreachable', async () => {
    // Watchtower ignores a non-zero exit anyway; the point is that this neither
    // hangs nor throws, so the container still stops.
    const fetchImpl = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const sleep = vi.fn(() => Promise.resolve());

    await expect(warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } })).resolves.toBeUndefined();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not sleep when the server rejects the call', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    const sleep = vi.fn(() => Promise.resolve());

    await warn({ fetchImpl, sleep, env: { MIDNIGHT_ADMIN_TOKEN: 'tok' } });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('says nothing, and asks for nothing, when the token is not configured', async () => {
    const fetchImpl = vi.fn();

    await warn({ fetchImpl, sleep: vi.fn(), env: {} });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
