import { useCallback, useEffect, useState } from 'react';
import { socket } from '../socket/socketClient';
import { BUILD_VERSION } from '../version';
import { isStaleBuild } from '../components/VersionBanner';

/**
 * The build the server is running, or null if it could not be established.
 *
 * `cache: 'no-store'` is load bearing. `/public/stats` is served with
 * `Cache-Control: public, max-age=15`, and this runs moments after a redeploy —
 * a cached body would report the version that was just replaced, which is
 * precisely the answer that makes the check useless.
 *
 * Every failure path returns null rather than a guess. A reconnect can race the
 * server coming back, and an unreachable endpoint must read as "unknown", never
 * as "you are up to date" and never as a spurious reload prompt.
 */
export async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch('/public/stats', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === 'string' && body.version ? body.version : null;
  } catch {
    return null;
  }
}

export interface VersionCheckState {
  /** The server's build when it differs from ours, else null. */
  serverVersion: string | null;
  reload: () => void;
  dismiss: () => void;
}

/**
 * Notices that this page is running an older build than the server.
 *
 * Deploys are hands-off and the socket reconnects on its own, so the page keeps
 * the bundle it was loaded with straight through a restart — the owner had to
 * hard-refresh to pick up v0.27.7. The check runs on `connect`, which is the
 * moment the answer can have changed and the same hook point that clears the
 * deploy banner.
 *
 * @see docs/DECISIONS.md 2026-09-20
 */
export function useVersionCheck(): VersionCheckState {
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  const dismiss = useCallback(() => { setServerVersion(null); }, []);

  // `location.reload()` re-requests index.html, which is what carries the
  // hashed bundle names — so the new build is picked up without the player
  // having to know what a hard refresh is.
  const reload = useCallback(() => { window.location.reload(); }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async (): Promise<void> => {
      const version = await fetchServerVersion();
      if (cancelled) return;
      setServerVersion(isStaleBuild(BUILD_VERSION, version) ? version : null);
    };

    // On `connect` rather than on an interval: a redeploy is the only thing
    // that changes the answer, and it always drops the socket first. Polling
    // would ask the same question hundreds of times for one event.
    socket.on('connect', check);
    return () => {
      cancelled = true;
      socket.off('connect', check);
    };
  }, []);

  return { serverVersion, reload, dismiss };
}
