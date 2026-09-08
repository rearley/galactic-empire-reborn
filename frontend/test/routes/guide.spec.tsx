import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Guide, GuidePage } from '../../src/routes/Guide';

const GUIDE = {
  sections: [
    {
      title: 'Start here',
      blurb: 'What the game is.',
      entries: [
        { slug: 'getting-started', title: 'Getting started', body: ['Line one.', 'Line two.'] },
        {
          slug: 'the-galaxy', title: 'The galaxy', body: ['A galaxy.'],
          deviation: 'This galaxy is 201 sectors square. The original shipped 601.',
        },
      ],
    },
  ],
};

function mockGuide(ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => GUIDE,
  }) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('Guide index', () => {
  it('lists the pages the server sent', async () => {
    mockGuide();
    render(<MemoryRouter><Guide /></MemoryRouter>);
    expect(await screen.findByText('Getting started')).toBeInTheDocument();
    expect(await screen.findByText('The galaxy')).toBeInTheDocument();
  });

  it('points a stuck player back at the in-game help when the server is down', async () => {
    // The guide is a convenience; `hel` is the real thing and always available.
    mockGuide(false);
    render(<MemoryRouter><Guide /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/hel/);
  });
});

describe('Guide page', () => {
  function renderPage(slug: string) {
    return render(
      <MemoryRouter initialEntries={[`/guide/${slug}`]}>
        <Routes><Route path="/guide/:slug" element={<GuidePage />} /></Routes>
      </MemoryRouter>,
    );
  }

  it('renders canon help text for the requested page', async () => {
    mockGuide();
    renderPage('getting-started');
    expect(await screen.findByText(/Line one\./)).toBeInTheDocument();
  });

  it('shows the deviation notice where this port differs', async () => {
    // The landing page promises honesty about deviations; this is where that
    // promise is actually kept, on the page a reader is looking at.
    mockGuide();
    renderPage('the-galaxy');
    expect(await screen.findByText(/201 sectors square/)).toBeInTheDocument();
    expect(screen.getByText(/differs here/i)).toBeInTheDocument();
  });

  it('says so plainly for an unknown slug rather than rendering blank', async () => {
    mockGuide();
    renderPage('no-such-page');
    expect(await screen.findByText(/no page called/i)).toBeInTheDocument();
  });
});
