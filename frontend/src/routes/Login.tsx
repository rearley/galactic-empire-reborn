import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { setToken } from '../auth/tokenStore';
import { AuthForm, Field } from './AuthForm';

interface LocationState {
  from?: string;
}

/**
 * `RequireAuth` (routes/RequireAuth.tsx) redirects an unauthenticated visitor
 * here with the path they were trying to reach in `location.state.from`. On a
 * successful login we send them on to that path rather than always to /play,
 * so a deep link (e.g. /stats) survives authentication instead of silently
 * dropping them on the default route.
 *
 * @see backend POST /auth/login
 */
export function Login(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.message as string | undefined) ?? 'Login failed.');
        return;
      }
      setToken(body.token as string);
      // A player who stopped after step 1 must finish it; sending them to /play
      // would bounce off RequireAuth and read as a broken login.
      const user = body.user as { username: string | null } | undefined;
      if (!user?.username) {
        navigate('/register/name');
        return;
      }
      const state = location.state as LocationState | null;
      navigate(state?.from ?? '/play');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="LOG IN"
      error={error}
      loading={loading}
      submitLabel="Log in"
      onSubmit={handleSubmit}
      footer={<>New pilot? <Link to="/register" className="text-gray-400 underline hover:text-gray-200">Enlist</Link></>}
    >
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        id="password" label="Password" type="password" value={password}
        onChange={setPassword} autoComplete="current-password"
      />
    </AuthForm>
  );
}
