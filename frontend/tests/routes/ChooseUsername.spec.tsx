// @vitest-environment jsdom

/**
 * Finding 6 (final whole-branch review, 2026-09-07): JWT_EXPIRES_IN is 30
 * days but the midnight sweep deletes an abandoned signup at 10, so a
 * returning player can hold a valid token for an account that no longer
 * exists. Before this fix, POST /auth/username 404s with "Account not
 * found." and ChooseUsername just showed that as an inline error with no
 * way forward — the player is stuck on a screen for an account that is
 * gone, and "/" still shows them as signed in because the stale token is
 * never cleared.
 *
 * Fix: on a 404 (NO_SUCH_USER) or 401 from POST /auth/username, clear the
 * token and route back to /register so the player can start over.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { ChooseUsername } from '../../src/routes/ChooseUsername';
import { Register } from '../../src/routes/Register';
import { getToken, setToken, clearToken } from '../../src/auth/tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function submitUsername(name: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), name);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
}

describe('ChooseUsername — stale-token recovery (Finding 6)', () => {
  beforeEach(() => {
    setToken('a-token-for-a-deleted-account');
  });

  afterEach(() => {
    clearToken();
    vi.unstubAllGlobals();
  });

  it('on 404 NO_SUCH_USER: clears the token and routes to /register', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { code: 'NO_SUCH_USER', message: 'Account not found.' }),
      ),
    );

    render(
      <MemoryRouter initialEntries={['/register/name']}>
        <Routes>
          <Route path="/register/name" element={<ChooseUsername />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </MemoryRouter>,
    );

    await submitUsername('newpilot');

    // Landed back on step 1 of registration...
    expect(await screen.findByText('ENLIST — step 1 of 2')).toBeInTheDocument();
    // ...and the stale token for the now-deleted account is gone.
    expect(getToken()).toBeNull();
  });

  it('on 401: clears the token and routes to /register', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'Unauthorized.' })),
    );

    render(
      <MemoryRouter initialEntries={['/register/name']}>
        <Routes>
          <Route path="/register/name" element={<ChooseUsername />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </MemoryRouter>,
    );

    await submitUsername('newpilot');

    expect(await screen.findByText('ENLIST — step 1 of 2')).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('on 409 USERNAME_TAKEN: keeps the token and stays on step 2 (existing behaviour, not a regression)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, { code: 'USERNAME_TAKEN', message: 'That username is already taken.' }),
      ),
    );

    render(
      <MemoryRouter initialEntries={['/register/name']}>
        <Routes>
          <Route path="/register/name" element={<ChooseUsername />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </MemoryRouter>,
    );

    await submitUsername('taken');

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
    expect(getToken()).toBe('a-token-for-a-deleted-account');
  });
});
