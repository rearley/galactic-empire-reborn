import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import { SiteHeader } from '../../src/routes/SiteHeader';
import { SiteFooter } from '../../src/routes/SiteFooter';
import { SOURCE_URL } from '../../src/content/provenance-notes';
import { clearToken, setToken } from '../../src/auth/tokenStore';

/**
 * The public chrome, split in two.
 *
 * Seven links in one row overflowed a phone: at 390px the nav measured 457px,
 * the document scrolled sideways, and "Log out" sat off the right edge where
 * nobody could reach it. Adding a bug-report link would have made it worse.
 *
 * So the header carries what somebody came to DO — read the guide, play — and
 * the footer carries what the project is: the tools, the status, what changed,
 * who is owed credit, and where to report a bug.
 */
const renderIn = (el: React.JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

afterEach(() => clearToken());

describe('SiteHeader', () => {
  it('carries only the links about playing', () => {
    renderIn(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Guide' })).toBeDefined();
    // These moved to the footer; a header that grows with every new page is
    // how it broke in the first place.
    for (const gone of ['Calculators', 'Status', 'Changes', 'Credits']) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull();
    }
  });

  it('keeps a gap between the wordmark and the nav, and wraps rather than colliding', () => {
    // Signed in as the sysop there are four items beside the wordmark, and on a
    // 390px phone they ran into it: the header read "GALACTIC EMPIREGuide".
    // `justify-between` alone has nothing to give once the row is full.
    setToken('a-token');
    const { container } = renderIn(<SiteHeader />);
    const header = container.querySelector('header')!;
    expect(header.className).toMatch(/flex-wrap/);
    expect(header.className).toMatch(/gap-x-/);
  });

  it('offers the way in when signed out, and the way back when signed in', () => {
    renderIn(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Enlist' })).toBeDefined();
    clearToken();
  });

  it('shows Play and Log out to a signed-in captain', () => {
    setToken('a-token');
    renderIn(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Play' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDefined();
  });
});

describe('SiteFooter', () => {
  it('carries the project links the header gave up', () => {
    renderIn(<SiteFooter />);

    for (const name of ['Calculators', 'Status', 'Changes', 'Credits']) {
      expect(screen.getByRole('link', { name })).toBeDefined();
    }
  });

  it('points bug reports at the issue tracker of THIS build', () => {
    // Derived from SOURCE_URL rather than hardcoded, for the same reason the
    // donate link is a build arg: the repo is AGPL and anyone may run their own
    // galaxy. A fixed link would send a fork's bug reports to us, and their
    // players would never know. A fork changes SOURCE_URL for the AGPL source
    // offer already, and this follows it.
    renderIn(<SiteFooter />);

    const report = screen.getByRole('link', { name: /report/i });
    expect(report.getAttribute('href')).toBe(`${SOURCE_URL}/issues`);
    expect(report.getAttribute('rel')).toContain('noopener');
  });
});
