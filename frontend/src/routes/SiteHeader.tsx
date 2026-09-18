import React from 'react';
import { Link } from 'react-router-dom';
import { getToken } from '../auth/tokenStore';
import { logout } from '../auth/logout';

/** Shared nav for the public pages. Not rendered inside the terminal. */
export function SiteHeader(): React.JSX.Element {
  const signedIn = getToken() !== null;
  return (
    <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3 font-mono text-sm">
      <Link to="/" className="uppercase tracking-widest text-yellow-400">Galactic Empire</Link>
      <nav className="flex gap-4 text-gray-400">
        <Link to="/guide" className="hover:text-gray-200">Guide</Link>
        <Link to="/calculators" className="hover:text-gray-200">Calculators</Link>
        <Link to="/stats" className="hover:text-gray-200">Status</Link>
        <Link to="/changelog" className="hover:text-gray-200">Changes</Link>
        <Link to="/provenance" className="hover:text-gray-200">Credits</Link>
        {signedIn ? (
          <>
            <Link to="/play" className="hover:text-gray-200">Play</Link>
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
