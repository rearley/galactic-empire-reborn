// @vitest-environment jsdom

/**
 * T029 — AuthScreen register tab (TDD, intentionally failing until implementation).
 *
 * AuthScreen must:
 *   - Render a Register tab with username + password fields
 *   - POST to /auth/register on form submission
 *   - On a 201 success response that contains { token }, store the token and
 *     call the onAuthenticated callback
 *
 * @see specs/011-onboarding/plan.md §AuthScreen
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// This import will fail until src/auth/AuthScreen.tsx is created.
import { AuthScreen } from '../../src/auth/AuthScreen';

describe('AuthScreen — register tab (T029)', () => {
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    // Provide a default successful fetch mock.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: 'jwt-token-abc' }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders username and password fields on the Register tab', () => {
    render(<AuthScreen onAuthenticated={onAuthenticated} />);
    // The component should expose a Register tab / section by default or via clicking.
    // Accept either a button/tab labelled "Register" or the fields being visible directly.
    expect(screen.getByLabelText(/username/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('calls POST /auth/register with credentials on form submission', async () => {
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText(/username/i), 'TestPilot');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/auth/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ username: 'TestPilot', password: 'secret123' }),
        }),
      );
    });
  });

  it('calls onAuthenticated callback after successful registration', async () => {
    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText(/username/i), 'TestPilot');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith('jwt-token-abc');
    });
  });

  it('shows an error message when the server returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Username already taken' }),
    } as Response);

    const user = userEvent.setup();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText(/username/i), 'TakenName');
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
