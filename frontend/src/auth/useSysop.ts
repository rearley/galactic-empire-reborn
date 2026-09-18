import { useEffect, useState } from 'react';
import { getToken } from './tokenStore';

/**
 * Is the signed-in account the sysop?
 *
 * Asked of `/auth/me`, which reads the username out of the token rather than
 * the database. The answer is COSMETIC — it decides whether the header offers
 * the Reports link — and `ReportsController` asks the same question again on
 * every request. A hidden button is not a permission, and this must never be
 * the only thing standing between a curious captain and the reports feed.
 *
 * Signed-out visitors are not asked at all: the landing page is public and an
 * unauthenticated call per page load would be noise in the logs and a 401 in
 * the console.
 */
export function useSysop(): { sysop: boolean; username: string | null } {
  const [state, setState] = useState<{ sysop: boolean; username: string | null }>({
    sysop: false,
    username: null,
  });

  useEffect(() => {
    const token = getToken();
    if (token === null) return;

    let cancelled = false;
    fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((me: { username: string | null; sysop: boolean }) => {
        if (!cancelled) setState({ sysop: me.sysop === true, username: me.username ?? null });
      })
      // A failure means "no link", which is the same as the default. Nothing to
      // report to a player who was never going to see the link anyway.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return state;
}
