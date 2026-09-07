import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, setToken, clearToken } from '../auth/tokenStore';
import { AuthForm, Field } from './AuthForm';

/**
 * Step 2 of two: the display handle, unique and permanent.
 *
 * The token returned here REPLACES the one from step 1. That one carries
 * username: null and WsAuthGuard refuses it, so keeping it would leave the
 * player registered and unable to enter the game.
 *
 * A failed attempt (e.g. USERNAME_TAKEN) must NOT clear the stored token —
 * the player is mid-signup, and clearing it here would log them out of a
 * half-finished registration with no way back in.
 *
 * The one exception is 404 (NO_SUCH_USER) or 401: the account this token
 * names no longer exists — most likely the midnight sweep deleted it
 * (JWT_EXPIRES_IN is 30 days but an abandoned signup is swept at 10, so a
 * returning player can hold a token that outlived its account). Staying on
 * this screen with the stale token would just repeat the same 404/401
 * forever, and "/" would keep showing them as signed in. Clearing the token
 * and sending them to step 1 lets them start over instead.
 *
 * @see backend POST /auth/username
 */
export function ChooseUsername(): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({ username }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          clearToken();
          navigate('/register');
          return;
        }
        setError((body.message as string | undefined) ?? 'Could not set that username.');
        return;
      }
      setToken(body.token as string);
      navigate('/play');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="ENLIST — step 2 of 2"
      error={error}
      loading={loading}
      submitLabel="Confirm"
      onSubmit={handleSubmit}
    >
      <Field
        id="username" label="Username" type="text" value={username}
        onChange={setUsername} autoComplete="username"
        hint="3–16 characters. This is how the galaxy will know you, and it cannot be changed."
      />
    </AuthForm>
  );
}
