import React, { useState } from 'react';

interface Props {
  onAuthenticated: (token: string) => void;
}

export function AuthScreen({ onAuthenticated }: Props): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const msg = (body.message as string | undefined) ?? 'Registration failed';
        setError(msg);
        return;
      }
      onAuthenticated(body.token as string);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-black font-mono text-gray-100">
      <div className="w-80">
        <h1 className="mb-6 text-center text-xl text-yellow-400 uppercase tracking-widest">
          Galactic Empire
        </h1>
        <form onSubmit={handleSubmit}>
          {error && (
            <p role="alert" className="mb-3 text-red-400 text-sm">{error}</p>
          )}
          <div className="mb-3">
            <label htmlFor="username" className="block mb-1 text-sm text-gray-400">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black border border-gray-600 text-gray-100 px-2 py-1"
              autoComplete="username"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="block mb-1 text-sm text-gray-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-gray-600 text-gray-100 px-2 py-1"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-yellow-600 py-1 text-yellow-400 hover:bg-yellow-900 disabled:opacity-50"
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
}
