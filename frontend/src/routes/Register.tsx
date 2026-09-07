import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setToken } from '../auth/tokenStore';
import { AuthForm, Field } from './AuthForm';

/**
 * Step 1 of two: credentials only.
 *
 * Split so that "that email is taken" arrives before the player has invested in
 * choosing a name — wrong order is a bad first impression.
 *
 * @see backend POST /auth/register
 */
export function Register(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((body.message as string | undefined) ?? 'Registration failed.');
        return;
      }
      setToken(body.token as string);
      navigate('/register/name');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="ENLIST — step 1 of 2"
      error={error}
      loading={loading}
      submitLabel="Enlist"
      onSubmit={handleSubmit}
      footer={<>Already flying? <Link to="/login" className="text-gray-400 underline hover:text-gray-200">Log in</Link></>}
    >
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        id="password" label="Password" type="password" value={password}
        onChange={setPassword} autoComplete="new-password" hint="At least 8 characters."
      />
    </AuthForm>
  );
}
