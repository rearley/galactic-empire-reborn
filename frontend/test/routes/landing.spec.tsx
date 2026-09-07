import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Landing } from '../../src/routes/Landing';
import { PORT_RELEASE, PORT_RELEASE_DATE, HOOKS, FAITHFUL, CHANGED } from '../../src/content/port-notes';

function renderLanding() {
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

describe('Landing', () => {
  it('names the game and its author', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/galactic empire/i);
    expect(screen.getByText(/Mike Murdock/i)).toBeInTheDocument();
  });

  it('states exactly which release was ported', () => {
    // "a port of the BBS game" is not a claim anyone can check. The release and
    // its date are, and GEREADME.DOC is where they come from.
    renderLanding();
    expect(screen.getByText(new RegExp(PORT_RELEASE))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PORT_RELEASE_DATE))).toBeInTheDocument();
  });

  it('lists what is faithful and what changed', () => {
    renderLanding();
    FAITHFUL.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
    CHANGED.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
  });

  it('leads with what the game is, before what the port is', () => {
    // The page exists to make a stranger want to play. An earlier draft opened
    // with the faithful/changed lists and cited C filenames — evidence for a
    // claim nobody had asked about yet. The hooks come first now.
    renderLanding();
    HOOKS.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
  });

  it('keeps the port evidence out of the player-facing copy', () => {
    // Filenames like GECYBS.C and MBMGESHP.MSG are how the fidelity claims are
    // verified, not why anyone would sign up. They belong in docs/, not here.
    renderLanding();
    const page = screen.getByRole('main').textContent ?? '';
    expect(page).not.toMatch(/\.C\b|\.MSG\b|GECYBS|MBMGE/);
  });

  it('offers a way in, from the body and not only the header', () => {
    // The requirement is that a visitor who has read to the bottom does not
    // have to scroll back up to find the only way in — so this asserts a CTA
    // exists INSIDE main, and that every Enlist link goes to /register.
    //
    // It used to assert exactly two. That was a trip-wire for deleting the
    // body CTA, which had happened once, but it also failed the moment a
    // third legitimate call to action was added. The count was never the
    // requirement; a reachable way in is.
    renderLanding();
    const all = screen.getAllByRole('link', { name: /enlist/i });
    expect(all.length).toBeGreaterThanOrEqual(2);
    all.forEach((link) => expect(link).toHaveAttribute('href', '/register'));

    const inBody = within(screen.getByRole('main')).getAllByRole('link', { name: /enlist/i });
    expect(inBody.length).toBeGreaterThanOrEqual(1);
  });
});

describe('port-notes', () => {
  it('is honest about the galaxy size, which is the deviation players feel', () => {
    expect(CHANGED.join(' ')).toMatch(/201/);
  });
});
