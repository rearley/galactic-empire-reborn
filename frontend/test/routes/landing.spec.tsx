import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Landing } from '../../src/routes/Landing';
import { PORT_RELEASE, PORT_RELEASE_DATE, FAITHFUL, CHANGED } from '../../src/content/port-notes';

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

  it('offers a way in', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: /enlist/i })).toHaveAttribute('href', '/register');
  });
});

describe('port-notes', () => {
  it('is honest about the galaxy size, which is the deviation players feel', () => {
    expect(CHANGED.join(' ')).toMatch(/201/);
  });
});
