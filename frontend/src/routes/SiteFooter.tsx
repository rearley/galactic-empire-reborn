import React from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_URL } from '../content/provenance-notes';

/**
 * What the project IS, under every public page.
 *
 * The header used to carry all of this, and at 390px its seven links measured
 * 457px: the page scrolled sideways and "Log out" sat off the right edge. The
 * split is not just a fix for that — it is the honest division. The header is
 * what a visitor came to DO; this is what the thing they are looking at is.
 *
 * Not rendered inside the terminal at /play. A footer under a game that fills
 * the viewport would be furniture nobody asked for.
 */
export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="mt-16 border-t border-gray-800 px-4 py-6 font-mono text-xs">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-gray-500">
        <Link to="/calculators" className="hover:text-gray-300">Calculators</Link>
        <Link to="/stats" className="hover:text-gray-300">Status</Link>
        <Link to="/changelog" className="hover:text-gray-300">Changes</Link>
        <Link to="/provenance" className="hover:text-gray-300">Credits</Link>
      </nav>
      <p className="mt-4 text-center text-gray-600">
        Found a bug, or something the original did differently?{' '}
        {/*
          * Derived from SOURCE_URL, never hardcoded. The repo is AGPL and
          * anyone may run their own galaxy from this code; a fixed link would
          * send a fork's bug reports here, and neither their players nor their
          * operator would notice. A fork already has to change SOURCE_URL for
          * the licence's source offer, and this follows it.
          * @see support.ts, which solves the same problem for the donate link
          */}
        <a
          href={`${SOURCE_URL}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 underline hover:text-gray-200"
        >
          Report it on the issue tracker
        </a>
        .
      </p>
    </footer>
  );
}
