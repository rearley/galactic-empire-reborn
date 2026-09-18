import React, { useCallback, useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { getToken } from '../auth/tokenStore';

interface Report {
  id: string;
  createdAt: string;
  userid: string;
  username: string | null;
  text: string;
  shipno: number | null;
  shipname: string | null;
  shpclass: number | null;
  xcoord: number | null;
  ycoord: number | null;
  damage: number | null;
  version: string;
  sha: string;
  status: string;
}

const authHeaders = (): HeadersInit => ({
  Authorization: `Bearer ${getToken() ?? ''}`,
  'Content-Type': 'application/json',
});

/**
 * /reports — what players have told the sysop, newest first.
 *
 * Reachable by anybody who types the URL; the SERVER is what refuses. The data
 * comes from `/admin/reports` rather than `/reports`, because the page owns
 * that path in the SPA and nginx only proxies `/auth/`, `/admin/`, `/public/`
 * and `/socket.io/` to the backend — anything else is served the app shell. The link
 * in the header is a convenience for the one account that can use it, not the
 * permission itself.
 *
 * Each card leads with the player's own words and follows with the context the
 * server attached: who, which hull, where, how damaged, and which build. The
 * build is the field that decides whether a report is still about the running
 * code, which is why it is on the card rather than behind a click.
 */
export function Reports(): React.JSX.Element {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch('/admin/reports', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { reports: Report[] }) => setReports(body.reports))
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  const close = async (id: string): Promise<void> => {
    await fetch(`/admin/reports/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'closed' }),
    });
    setReports((prev) =>
      prev === null ? prev : prev.map((r) => (r.id === id ? { ...r, status: 'closed' } : r)),
    );
  };

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">Reports</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-gray-500">
          What players have told us, newest first
        </p>

        {error && (
          <p role="alert" className="mt-8 border-l-2 border-red-800 bg-red-950/20 py-2 pl-4 text-sm text-red-300">
            These are sysop only. If that should be you, check GE_SYSOP_USERNAME on the server.
          </p>
        )}

        {reports?.length === 0 && (
          <p className="mt-8 text-sm text-gray-500">
            Nothing reported yet. Players file these with the <span className="text-gray-300">bug</span> command.
          </p>
        )}

        <ul className="mt-8 space-y-4">
          {reports?.map((r) => (
            <li
              key={r.id}
              data-testid={`report-${r.id.slice(0, 8)}`}
              className={`border-l-2 py-3 pl-4 ${
                r.status === 'closed'
                  ? 'border-gray-800 bg-gray-900/30 text-gray-500'
                  : 'border-yellow-700 bg-yellow-950/10'
              }`}
            >
              <p className="text-sm leading-relaxed text-gray-200">{r.text}</p>
              <p className="mt-2 text-xs text-gray-500">
                {r.username ?? r.userid}
                {r.shipname !== null && <> · {r.shipname} (class {r.shpclass})</>}
                {r.xcoord !== null && r.ycoord !== null && (
                  <> · sector ({Math.floor(r.xcoord)}, {Math.floor(r.ycoord)})</>
                )}
                {r.damage !== null && <> · {Math.round(r.damage)}% damage</>}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {new Date(r.createdAt).toISOString().replace('T', ' ').slice(0, 16)} · {r.version} ·{' '}
                {r.sha} · {r.id.slice(0, 8)}
              </p>
              {r.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => void close(r.id)}
                  className="mt-3 border border-gray-700 px-3 py-1 text-xs uppercase tracking-widest text-gray-400 hover:border-gray-500 hover:text-gray-200"
                >
                  Close
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
