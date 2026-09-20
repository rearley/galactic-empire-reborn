import React from 'react';

interface VersionBannerProps {
  /** The build the SERVER reports, or null while it is unknown. */
  serverVersion: string | null;
  onReload: () => void;
  onDismiss: () => void;
}

/**
 * True when the page is running an older build than the server.
 *
 * Both sides format the string identically — `v0.27.8 · 3fae5a4`, the release
 * then the short SHA — so a plain inequality is the whole comparison. There is
 * deliberately no attempt to decide which is NEWER: the server is the one
 * serving the bundle, so any disagreement means this page is the stale one.
 *
 * Returns false whenever either side is a development build. `dev` is what
 * `version.ts` yields with no GIT_SHA and `v?` with no VITE_APP_VERSION; a dev
 * client rebuilds on save, so nagging it on every restart would be noise — and
 * worse, it would train the reflex to ignore the banner that matters in
 * production.
 *
 * @see version.ts, backend/src/public/build-version.ts
 */
function isDevBuild(version: string): boolean {
  return version.includes('dev') || version.includes('v?');
}

export function isStaleBuild(clientVersion: string, serverVersion: string | null): boolean {
  if (!serverVersion) return false;
  if (isDevBuild(clientVersion) || isDevBuild(serverVersion)) return false;
  return clientVersion !== serverVersion;
}

/**
 * "A new version is running — reload when you are ready."
 *
 * Deploys here are hands-off and the socket reconnects by itself, so the page
 * keeps the bundle it was loaded with straight through a restart. The owner had
 * to hard-refresh to pick up v0.27.7, and until they did, the header claimed a
 * version the server was no longer running. That is not only cosmetic: a stale
 * client can be speaking an older event contract than the server it has just
 * reconnected to.
 *
 * NOT an automatic reload, deliberately. The reconnect lands at the exact
 * moment a player is most likely to be typing a command to re-orient
 * themselves, and taking the page away from them then is the most disruptive
 * possible timing — it would also discard whatever is in the command line.
 * @see docs/DECISIONS.md 2026-09-20
 *
 * Quieter than DeployBanner on purpose. That one is time-critical and
 * interrupts; this one loses nothing by being noticed at the next pause, so it
 * is `role="status"` and `aria-live="polite"`.
 */
export function VersionBanner({
  serverVersion,
  onReload,
  onDismiss,
}: VersionBannerProps): React.JSX.Element | null {
  if (!serverVersion) return null;

  return (
    <div
      data-testid="version-banner"
      role="status"
      aria-live="polite"
      className="flex w-full shrink-0 items-center gap-3 border-b border-sky-700 bg-sky-950 px-4 py-1.5 font-mono text-xs text-sky-100"
    >
      <span className="min-w-0 flex-1">
        Fleet Command is running {serverVersion}. This console is on an older
        build — reload when you are ready.
      </span>
      <button
        type="button"
        data-testid="version-reload"
        onClick={onReload}
        className="shrink-0 rounded border border-sky-500 px-2 py-0.5 hover:bg-sky-900"
      >
        Reload
      </button>
      <button
        type="button"
        data-testid="version-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss this notice"
        className="shrink-0 px-1 opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
