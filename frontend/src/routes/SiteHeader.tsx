import React from 'react';
import { Link } from 'react-router-dom';
import { getToken } from '../auth/tokenStore';
import { logout } from '../auth/logout';
import { useSysop } from '../auth/useSysop';

/**
 * Shared nav for the public pages. Not rendered inside the terminal.
 *
 * Only what a visitor came to DO: read the guide, and get in or out. Everything
 * describing the PROJECT — the calculators, the server status, what changed,
 * who is owed credit, where to report a bug — is in `SiteFooter`.
 *
 * It used to carry all of it, and seven links measured 457px inside a 390px
 * phone: the document scrolled sideways and "Log out" was off the right edge,
 * unreachable. A header that grows by one link per page will do that again, so
 * the rule is that new pages go in the footer unless they are somewhere a
 * player needs mid-session.
 */
export function SiteHeader(): React.JSX.Element {
  const signedIn = getToken() !== null;
  // Cosmetic only — the endpoint refuses on its own. @see auth/useSysop.ts
  const { sysop } = useSysop();
  return (
    <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3 font-mono text-sm">
      <Link to="/" className="uppercase tracking-widest text-yellow-400">Galactic Empire</Link>
      <nav className="flex gap-4 text-gray-400">
        <Link to="/guide" className="hover:text-gray-200">Guide</Link>
        {signedIn ? (
          <>
            <Link to="/play" className="hover:text-gray-200">Play</Link>
            {sysop && (
              <Link to="/reports" className="hover:text-gray-200">Reports</Link>
            )}
            <button type="button" onClick={() => logout()} className="hover:text-gray-200">Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:text-gray-200">Log in</Link>
            <Link to="/register" className="text-yellow-400 hover:text-yellow-200">Enlist</Link>
          </>
        )}
      </nav>
    </header>
  );
}
