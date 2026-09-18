import React, { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

interface RosterEntry {
  rank: number;
  username: string;
  score: string;
  kills: number;
  planets: number;
}

interface PublicStats {
  commanders: number;
  online: number;
  roster: RosterEntry[];
}

/** Server caches for 15s; polling faster would only re-read the same cache. */
const POLL_MS = 20_000;

export function Stats(): React.JSX.Element {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch('/public/stats');
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PublicStats;
        if (!cancelled) {
          setStats(body);
          setError(null);
        }
      } catch {
        // Keep the last good numbers on screen; a transient blip should not
        // blank a page someone is reading.
        if (!cancelled) setError('Status is unavailable right now.');
      }
    }

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg uppercase tracking-widest text-yellow-400">Galaxy status</h1>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}

        {stats && (
          <>
            <dl className="mb-8 flex gap-12" data-testid="stat-counts">
              <div>
                <dt className="text-xs uppercase text-gray-500">Commanders</dt>
                <dd className="text-2xl text-yellow-400">{stats.commanders}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">In flight now</dt>
                <dd className="text-2xl text-yellow-400">{stats.online}</dd>
              </div>
            </dl>

            <h2 className="mb-2 text-sm uppercase tracking-widest text-gray-400">Roster</h2>
            {stats.roster.length === 0 ? (
              <p className="text-sm text-gray-500">No one has scored yet. The galaxy is wide open.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="py-1 text-left">#</th>
                      <th className="py-1 text-left">Commander</th>
                      <th className="py-1 text-right">Score</th>
                      <th className="py-1 text-right">Kills</th>
                      <th className="py-1 text-right">Planets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.roster.map((r) => (
                      <tr key={r.username} className="border-t border-gray-900">
                        <td className="py-1">{r.rank}</td>
                        <td className="py-1 text-yellow-400">{r.username}</td>
                        <td className="py-1 text-right">{r.score}</td>
                        <td className="py-1 text-right">{r.kills}</td>
                        <td className="py-1 text-right">{r.planets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
