import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TitleBar } from '../src/components/TitleBar';
import { clearToken, setToken } from '../src/auth/tokenStore';

/**
 * Getting OUT of the game, for the one account that has somewhere else to be.
 *
 * The Reports link was first put in `SiteHeader`, which is public-pages only.
 * Logging in goes straight to `/play`, and the game renders `TitleBar` rather
 * than the site header — so the sysop landed in the ship selector with no way
 * to reach their reports except editing the URL. Reported immediately, and
 * fairly: "I thought I said as sysop i get options?"
 *
 * `TitleBar` is the right home because it is on screen in both places the
 * choice is wanted — the ship-select screen, which is already a "what do you
 * want to do" moment, and mid-flight.
 *
 * A plain anchor, NOT a react-router `Link`: `App` is rendered without a Router
 * ancestor by a dozen existing terminal specs, and a `Link` throws outside a
 * Router context. A whole-page load is also honest here — you are leaving the
 * game, and the socket should close behind you.
 */
afterEach(() => clearToken());

function mockMe(body: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 403, json: async () => body,
  }) as unknown as typeof fetch;
}

describe('TitleBar — the sysop’s way out of the game', () => {
  it('offers Reports to the sysop, with no Router in sight', async () => {
    setToken('t');
    mockMe({ username: 'Rick', sysop: true });

    render(<TitleBar status="connected" />);

    const link = await waitFor(() => screen.getByRole('link', { name: /reports/i }));
    expect(link.getAttribute('href')).toBe('/reports');
  });

  it('shows an ordinary captain nothing', async () => {
    setToken('t');
    mockMe({ username: 'Wasp', sysop: false });

    render(<TitleBar status="connected" />);

    await waitFor(() => expect(screen.getByTitle('build')).toBeDefined());
    expect(screen.queryByRole('link', { name: /reports/i })).toBeNull();
  });

  it('still renders the build identity and status when nobody is signed in', () => {
    mockMe({});
    render(<TitleBar status="connecting" />);

    expect(screen.getByTitle('build')).toBeDefined();
    expect(screen.queryByRole('link', { name: /reports/i })).toBeNull();
  });
});
