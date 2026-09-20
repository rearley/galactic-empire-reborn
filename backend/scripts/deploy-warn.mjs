/**
 * Watchtower pre-update hook. Runs INSIDE ge-backend, immediately before the
 * container is stopped.
 *
 * Watchtower BLOCKS on this command, which is the entire point. It is the only
 * place in the pipeline that knows the restart is really happening now, so it
 * is the only place a countdown can be honest: CI knows an image exists, but
 * watchtower polls on its own schedule and CI cannot know when.
 *
 * Because it runs in the container it talks to 127.0.0.1, so no notice endpoint
 * has to be reachable from outside and no secret has to leave the host.
 *
 * Contract — containrrr.dev/watchtower/lifecycle-hooks:
 *   label  com.centurylinklabs.watchtower.lifecycle.pre-update
 *   default timeout 60 SECONDS; the compose label raises it to 2 minutes,
 *   because 45 seconds of sleep plus node startup sits too close to 60
 *   a non-zero exit is logged but does NOT stop the update
 *
 * So this fails open by construction. The try/catch is belt and braces.
 *
 * @see src/gateway/deploy-notice.controller.ts
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */

const DEFAULT_PORT = '3000';

/**
 * Dependencies are injected so the spec needs no network and no real
 * 45-second wait. Nothing here throws.
 */
export async function warn({ fetchImpl = fetch, sleep = defaultSleep, env = process.env } = {}) {
  const token = env.MIDNIGHT_ADMIN_TOKEN;
  if (!token) {
    console.error('deploy-warn: MIDNIGHT_ADMIN_TOKEN unset, saying nothing');
    return;
  }

  try {
    const res = await fetchImpl(`http://127.0.0.1:${env.PORT ?? DEFAULT_PORT}/admin/deploy/notice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'imminent' }),
    });

    if (!res.ok) {
      console.error(`deploy-warn: server said ${res.status}, not holding the deploy`);
      return;
    }

    const { notified, countdownSeconds } = await res.json();
    if (!countdownSeconds) {
      console.error(`deploy-warn: ${notified} player(s) in-game, no countdown needed`);
      return;
    }

    console.error(`deploy-warn: told ${notified} player(s), holding ${countdownSeconds}s`);
    await sleep(countdownSeconds * 1000);
  } catch (err) {
    // A redeploy must never be blocked by the courtesy that announces it.
    console.error(`deploy-warn: ${err instanceof Error ? err.message : String(err)} — continuing`);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only when run directly, so importing this from a spec does not fire it.
if (import.meta.url === `file://${process.argv[1]}`) {
  await warn();
  process.exit(0);
}
