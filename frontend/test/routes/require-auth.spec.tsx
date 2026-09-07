import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import { RequireAuth } from '../../src/routes/RequireAuth';
import { setToken, clearToken } from '../../src/auth/tokenStore';

/** A JWT is three dot-separated base64url segments; only the middle is read. */
function fakeJwt(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${body}.signature`;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/register/name" element={<p>choose a username</p>} />
        <Route path="/play" element={<RequireAuth><p>the game</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  afterEach(() => clearToken());

  it('sends an anonymous visitor to the login page', () => {
    clearToken();
    renderAt('/play');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('the game')).not.toBeInTheDocument();
  });

  it('sends a half-registered player to finish choosing a username', () => {
    // Otherwise they reach /play, the socket opens, and WsAuthGuard closes it
    // with USERNAME_REQUIRED — a dead end with no way forward.
    setToken(fakeJwt({ sub: 'usr_half', username: null }));
    renderAt('/play');
    expect(screen.getByText('choose a username')).toBeInTheDocument();
  });

  it('lets a fully registered player through', () => {
    setToken(fakeJwt({ sub: 'usr_abc', username: 'rick' }));
    renderAt('/play');
    expect(screen.getByText('the game')).toBeInTheDocument();
  });

  it('treats a malformed token as no token instead of crashing', () => {
    setToken('not-a-jwt');
    renderAt('/play');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
});
