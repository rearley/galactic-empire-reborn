import type { INestApplicationContext } from '@nestjs/common';
import { DeployNoticeService } from './deploy-notice.service';
import { DeployPhase } from './deploy-notice.messages';

/** Signals a container stop actually sends. */
const DEFAULT_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

/**
 * Sends the last line out, on the way down.
 *
 * MUST be installed BEFORE `app.enableShutdownHooks()`. This began as
 * `GameGateway.beforeApplicationShutdown` and measuring it against a live
 * server proved it reached nobody: by the time that hook runs Nest has already
 * closed the sockets, so `PresenceService` is empty and the notice is correctly
 * suppressed — the log read `deploy notice down: nobody in-game` one second
 * after a connected player had been told about the countdown.
 *
 * Node runs signal listeners in registration order, so registering first means
 * firing while the sockets are still open. This is still BEST EFFORT — the
 * packet races the close and a client may never render it — but the warning
 * that does the real work is the pre-update one, 45 seconds earlier.
 *
 * Never throws. Nothing here may stop a container exiting.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
export function installDeploySignOff(
  app: INestApplicationContext,
  signals: NodeJS.Signals[] = DEFAULT_SIGNALS,
  proc: NodeJS.EventEmitter = process,
): void {
  // A stuck container gets SIGTERM and then SIGKILL, and some supervisors send
  // SIGTERM twice. Repeating the line would be the last thing a player saw.
  let said = false;

  for (const signal of signals) {
    proc.on(signal, () => {
      if (said) return;
      said = true;
      try {
        app.get(DeployNoticeService).announce(DeployPhase.DOWN);
      } catch {
        // Swallowed deliberately: a courtesy must never be the reason a
        // container fails to stop.
      }
    });
  }
}
