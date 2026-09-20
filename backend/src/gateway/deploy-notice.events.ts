import type { EventLogCategory } from '@ge/wire';
import type { DeployPhase } from './deploy-notice.messages';

/**
 * Internal event name.
 *
 * The HTTP caller must not hold the Socket.io server, and the gateway must not
 * own an HTTP route, so they meet on the event bus — the same shape as
 * COMBAT_SHIP_DESTROYED and CYBERTRON_EVENT.SPAWNED.
 */
export const DEPLOY_NOTICE = 'deploy.notice';

export interface DeployNoticeEvent {
  phase: DeployPhase;
  text: string;
  category: EventLogCategory;
  /**
   * Seconds until the stop, or 0 when there is no honest number. Carried on the
   * event so the gateway does not have to re-derive it, and so the banner and
   * the pre-update hook can never disagree about the same countdown.
   */
  seconds: number;
}
