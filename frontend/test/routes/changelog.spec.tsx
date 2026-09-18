import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Changelog } from '../../src/routes/Changelog';

/**
 * The changelog page.
 *
 * The four categories are the reason it exists, so the page must SHOW which
 * kind each change is rather than running them together as a list of fixes.
 * `backend/src/public/guide.ts` already keeps deviations and corrections apart
 * for the same reason — collapsing them either accuses the original of a change
 * we made, or claims credit for behaviour that was always canon, and this is
 * the most public page the port has.
 */
const BODY = {
  releases: [
    {
      version: '0.22.1',
      date: '2026-09-18',
      entries: [
        { category: 'port-bug', text: 'Choosing a ship is now its own screen.' },
        { category: 'deliberate-deviation', text: 'The galaxy is smaller than the original at 100 sectors.' },
      ],
    },
    {
      version: '0.21.1',
      date: '2026-09-18',
      entries: [{ category: 'canon-was-wrong', text: 'The manual claims warp 8; the code says otherwise.' }],
    },
  ],
  categories: {
    'port-bug': { title: 'Fixed', blurb: 'Something this port broke, now working.' },
    'corrected-to-canon': { title: 'Corrected to the original', blurb: 'We had drifted.' },
    'deliberate-deviation': { title: 'Deliberately different', blurb: 'We chose to differ.' },
    'canon-was-wrong': { title: 'The original disagreed with itself', blurb: 'We follow the code.' },
  },
};

function mockFetch(body: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => body,
  }) as unknown as typeof fetch;
}

const renderPage = () => render(<MemoryRouter><Changelog /></MemoryRouter>);

describe('Changelog', () => {
  it('lists every release, newest first', async () => {
    mockFetch(BODY);
    renderPage();

    await waitFor(() => expect(screen.getByText(/v0\.22\.1/)).toBeDefined());
    const headings = screen.getAllByTestId('release-version').map((el) => el.textContent);
    expect(headings).toEqual(['v0.22.1', 'v0.21.1']);
  });

  it('says which KIND each change is, not just what changed', async () => {
    mockFetch(BODY);
    renderPage();

    await waitFor(() => expect(screen.getByText(/own screen/)).toBeDefined());
    expect(screen.getAllByText('Fixed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deliberately different').length).toBeGreaterThan(0);
    expect(screen.getAllByText('The original disagreed with itself').length).toBeGreaterThan(0);
  });

  it('explains the four kinds once, at the top', async () => {
    // A reader meeting "deliberately different" for the first time needs to
    // know it is a claim about US, not about the original.
    mockFetch(BODY);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('category-legend')).toBeDefined());
    const legend = screen.getByTestId('category-legend');
    expect(legend.textContent).toContain('We chose to differ');
    expect(legend.textContent).toContain('We follow the code');
  });

  it('says so plainly when the changelog cannot be loaded', async () => {
    mockFetch(null, false);
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toMatch(/could not load/i);
  });
});
