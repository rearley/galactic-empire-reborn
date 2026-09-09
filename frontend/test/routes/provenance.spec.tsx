import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Provenance } from '../../src/routes/Provenance';
import {
  PORT_RELEASE,
  PORT_RELEASE_DATE,
  ORIGINAL_AUTHOR,
  AUTHORS_NOTE,
  PORTED,
  NOT_PORTED,
  LICENCE_NAME,
  LICENCE_NOTES,
  NOT_AFFILIATED,
} from '../../src/content/provenance-notes';

function renderPage() {
  return render(<MemoryRouter><Provenance /></MemoryRouter>);
}

describe('Provenance', () => {
  it('credits the original author by name and quotes his own release note', () => {
    // The author chose to release this source and said why. Paraphrasing him on
    // a page about attribution would be a strange thing to do.
    renderPage();
    expect(screen.getAllByText(new RegExp(ORIGINAL_AUTHOR)).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(AUTHORS_NOTE.slice(0, 40)))).toBeInTheDocument();
  });

  it('names the exact release it is a port of', () => {
    renderPage();
    expect(screen.getByText(new RegExp(PORT_RELEASE))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PORT_RELEASE_DATE))).toBeInTheDocument();
  });

  it('lists what was taken from the original and what was not', () => {
    renderPage();
    PORTED.forEach((item) => {
      expect(screen.getByText(item.what)).toBeInTheDocument();
      expect(screen.getByText(item.detail)).toBeInTheDocument();
    });
    NOT_PORTED.forEach((item) => {
      expect(screen.getByText(item.what)).toBeInTheDocument();
      expect(screen.getByText(item.detail)).toBeInTheDocument();
    });
  });

  /**
   * The whole reason this page exists. Someone told the owner that this port
   * owed credit to Elwynor Technologies under the AGPL. Elwynor maintain a
   * DIFFERENT port, which is indeed AGPL; nothing from it is used here. The
   * page has to be unambiguous about that in both directions — name them, and
   * say plainly that none of their work is in this.
   */
  it('says who Elwynor are and that none of their work is used here', () => {
    renderPage();
    const elwynor = NOT_PORTED.find((i) => /Elwynor/.test(i.what));
    expect(elwynor).toBeDefined();
    expect(elwynor?.detail).toMatch(/no code, data or bug fix from it is used here/i);
    // Both halves, or the page reads as a brush-off. Elwynor state they took
    // over the original publisher's products and they maintain the game today,
    // so the page acknowledges that in the same breath as declining the credit
    // for code we did not use. Added after the person who raised this turned
    // out to have forked the same upstream we did, not a different one.
    expect(elwynor?.detail).toMatch(/current stewards/);
    expect(screen.getByText(elwynor!.detail)).toBeInTheDocument();
  });

  it('states the licence and why the network variant was chosen', () => {
    // A page that says "AGPL" without saying what that obliges us to is a
    // badge, not a notice.
    renderPage();
    expect(screen.getByText(new RegExp(LICENCE_NAME))).toBeInTheDocument();
    LICENCE_NOTES.forEach((note) => expect(screen.getByText(note)).toBeInTheDocument());
    expect(screen.getByText(NOT_AFFILIATED)).toBeInTheDocument();
  });

  it('offers the source to the people playing, which is what the licence requires', () => {
    // AGPL section 13. A link is the whole point; a claim without one is worse
    // than saying nothing, because it looks like compliance.
    renderPage();
    const link = screen.getByRole('link', { name: /source/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).toMatch(/^https?:\/\//);
  });
});
