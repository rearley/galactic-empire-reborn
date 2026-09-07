import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Login } from '../../src/routes/Login';
import { Register } from '../../src/routes/Register';
import { ChooseUsername } from '../../src/routes/ChooseUsername';
import { setToken, getToken, clearToken } from '../../src/auth/tokenStore';

function mockFetch(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  globalThis.fetch = f as unknown as typeof fetch;
  return f;
}

function renderRoute(element: React.JSX.Element, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/play" element={<p>the game</p>} />
        <Route path="/register/name" element={<p>choose a username</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => clearToken());

describe('Register', () => {
  it('posts email and password, then sends the player to step 2', async () => {
    const f = mockFetch(201, { token: 'step1.token', user: { id: 'usr_a', username: null } });
    renderRoute(<Register />, '/register');

    await userEvent.type(screen.getByLabelText(/email/i), 'pilot@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /enlist|register/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      email: 'pilot@example.com', password: 'hunter2hunter2',
    });
    expect(getToken()).toBe('step1.token');
    await screen.findByText('choose a username');
  });

  it('shows the server message when the email is taken', async () => {
    mockFetch(409, { code: 'EMAIL_TAKEN', message: 'An account with that email already exists.' });
    renderRoute(<Register />, '/register');

    await userEvent.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /enlist|register/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(getToken()).toBeNull();
  });
});

describe('Login', () => {
  it('posts email, not a display handle', async () => {
    const f = mockFetch(200, { token: 'login.token', user: { id: 'usr_a', username: 'rick' } });
    renderRoute(<Login />, '/login');

    await userEvent.type(screen.getByLabelText(/email/i), 'rick@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      email: 'rick@example.com', password: 'hunter2hunter2',
    });
    await screen.findByText('the game');
  });

  it('routes a half-registered account to step 2 rather than the game', async () => {
    mockFetch(200, { token: 'half.token', user: { id: 'usr_h', username: null } });
    renderRoute(<Login />, '/login');

    await userEvent.type(screen.getByLabelText(/email/i), 'half@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await screen.findByText('choose a username');
  });

  it('sends an unauthenticated visitor back to the deep link they came from', async () => {
    const f = mockFetch(200, { token: 'login.token', user: { id: 'usr_a', username: 'rick' } });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/stats' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/play" element={<p>the game</p>} />
          <Route path="/stats" element={<p>your stats</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'rick@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    await screen.findByText('your stats');
  });
});

describe('ChooseUsername', () => {
  it('sends the bearer token and stores the fresh one', async () => {
    // The step-1 token cannot open a socket; only the token this call returns
    // can. Storing the old one would strand the player.
    setToken('step1.token');
    const f = mockFetch(200, { token: 'step2.token', user: { id: 'usr_a', username: 'rick' } });
    renderRoute(<ChooseUsername />, '/register/name');

    await userEvent.type(screen.getByLabelText(/username/i), 'rick');
    await userEvent.click(screen.getByRole('button', { name: /continue|confirm|choose/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer step1.token');
    expect(getToken()).toBe('step2.token');
    await screen.findByText('the game');
  });

  it('reports a taken username without discarding the session', async () => {
    setToken('step1.token');
    mockFetch(409, { code: 'USERNAME_TAKEN', message: 'That username is already taken.' });
    renderRoute(<ChooseUsername />, '/register/name');

    await userEvent.type(screen.getByLabelText(/username/i), 'rick');
    await userEvent.click(screen.getByRole('button', { name: /continue|confirm|choose/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
    expect(getToken()).toBe('step1.token');
  });
});
