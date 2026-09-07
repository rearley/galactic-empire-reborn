// @vitest-environment jsdom

/**
 * Regression coverage for Finding 3 (final whole-branch review, 2026-09-07):
 * a browser that throws on every localStorage access must not silently break
 * the register-then-choose-username or login-then-play flows. Before the
 * fix, setToken() no-op'd against a throwing localStorage and nothing else
 * held the token, so ChooseUsername sent `Authorization: Bearer ` (empty)
 * and a successful login bounced straight back to /login via RequireAuth —
 * a silent loop with no error shown.
 *
 * tokenStore.ts is exercised for real here (not mocked) — that is the module
 * under test. Only the socket layer is mocked, the same way App.spec.tsx
 * does, so App can mount at /play without opening a real connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { Register } from '../../src/routes/Register';
import { ChooseUsername } from '../../src/routes/ChooseUsername';
import { Login } from '../../src/routes/Login';
import { RequireAuth } from '../../src/routes/RequireAuth';
import { clearToken } from '../../src/auth/tokenStore';

vi.mock('../../src/socket/socketClient', () => ({
  socket: { connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  connectSocket: vi.fn(),
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onSocketAuthFailed: vi.fn(),
}));

vi.mock('../../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'disconnected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: null,
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

/**
 * A JWT-shaped (but unsigned) fake token: `session.ts`'s `isValidToken` /
 * `hasUsername` only check segment count and decode the payload — they never
 * verify the signature (that is the server's job) — so a plausible fake is
 * enough to drive RequireAuth's routing decision in a test.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`;
}

describe('session persistence when localStorage throws (Finding 3)', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let setSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearToken();
    getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
  });

  afterEach(() => {
    getSpy.mockRestore();
    setSpy.mockRestore();
    vi.unstubAllGlobals();
    clearToken();
  });

  it('register then choose-username: the second request still carries the real bearer token', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/auth/register') {
        return jsonResponse({ token: 'reg-token-123', user: { id: 'usr_1', username: null } });
      }
      if (url === '/auth/username') {
        return jsonResponse({ token: 'final-token', user: { id: 'usr_1', username: 'newpilot' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/register/name" element={<ChooseUsername />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'pilot@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Enlist' }));

    // Navigated to step 2 — proves setToken()'s in-memory fallback let
    // ChooseUsername mount past whatever gate depends on a token existing.
    const usernameField = await screen.findByLabelText('Username');
    await user.type(usernameField, 'newpilot');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/username',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer reg-token-123' }),
      }),
    );
  });

  it('login then /play: RequireAuth does not bounce back to /login', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/auth/login') {
        return jsonResponse({
          token: fakeJwt({ sub: 'usr_2', username: 'rick' }),
          user: { id: 'usr_2', username: 'rick' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/play"
            element={
              <RequireAuth>
                <div data-testid="play-screen">Terminal</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'rick@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    // The old bug: setToken() no-op'd, RequireAuth's getToken() read null,
    // and the player was sent straight back to /login — a silent loop.
    expect(await screen.findByTestId('play-screen')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
