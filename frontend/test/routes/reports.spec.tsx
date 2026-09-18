import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Reports } from '../../src/routes/Reports';
import { SiteHeader } from '../../src/routes/SiteHeader';
import { clearToken, setToken } from '../../src/auth/tokenStore';

/**
 * The sysop's reports view, and the link that gets them there.
 *
 * The sysop signs in as an ordinary player — there is no separate admin login —
 * so the header has to decide whether to offer the link, and asks `/auth/me`.
 * That answer is COSMETIC: `ReportsController` asks the same question again and
 * is the thing that actually refuses. A hidden button is not a permission.
 *
 * The data path is `/admin/reports`, not `/reports`: the PAGE owns `/reports`
 * in the SPA, and nginx proxies only `/auth/`, `/admin/`, `/public/` and
 * `/socket.io/` to the backend. A top-level API route would have been answered
 * by the app shell in production.
 */
const REPORTS = {
  reports: [
    {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      createdAt: '2026-09-18T12:00:00.000Z',
      username: 'Wasp', userid: 'u2', text: 'the scanner shows a planet that is not there',
      shipno: 1, shipname: 'Stinger', shpclass: 1,
      xcoord: -12.5, ycoord: 40.25, damage: 3,
      version: 'v0.23.1', sha: 'abc1234', status: 'open',
    },
  ],
};

function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = routes[url] ?? routes[url.split('?')[0]];
    return Promise.resolve({
      ok: body !== undefined, status: body === undefined ? 403 : 200,
      json: async () => body ?? {},
    });
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => clearToken());

describe('SiteHeader — the Reports link', () => {
  it('offers Reports to the sysop', async () => {
    setToken('t');
    mockFetch({ '/auth/me': { username: 'Rick', sysop: true } });
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Reports' })).toBeDefined());
  });

  it('shows an ordinary captain nothing at all', async () => {
    setToken('t');
    mockFetch({ '/auth/me': { username: 'Wasp', sysop: false } });
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Play' })).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Reports' })).toBeNull();
  });

  it('asks nothing when nobody is signed in', () => {
    const calls = mockFetch({ '/auth/me': { username: null, sysop: false } });
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);

    expect(calls.filter((c) => c.url === '/auth/me')).toHaveLength(0);
  });
});

describe('Reports', () => {
  it('shows each report with the context that makes it actionable', async () => {
    setToken('t');
    mockFetch({ '/admin/reports': REPORTS });
    render(<MemoryRouter><Reports /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText(/planet that is not there/)).toBeDefined());
    const card = screen.getByTestId('report-aaaaaaaa');
    expect(card.textContent).toContain('Wasp');
    expect(card.textContent).toContain('Stinger');
    // Sector and build are the two a report is useless without.
    expect(card.textContent).toMatch(/-12|-13/);
    expect(card.textContent).toContain('v0.23.1');
  });

  it('closes a report, and stops showing it as open', async () => {
    setToken('t');
    const calls = mockFetch({
      '/admin/reports': REPORTS,
      '/admin/reports/aaaaaaaa-1111-2222-3333-444444444444': { id: 'x', status: 'closed' },
    });
    render(<MemoryRouter><Reports /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /close/i })).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse(patch!.init!.body as string)).toEqual({ status: 'closed' });
    });
  });

  it('says so plainly when the server refuses', async () => {
    setToken('t');
    mockFetch({});
    render(<MemoryRouter><Reports /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toMatch(/sysop/i);
  });
});
