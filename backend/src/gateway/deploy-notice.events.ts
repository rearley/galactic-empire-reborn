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

export interface DeployNoticePayload {
  phase: DeployPhase;
  text: string;
  category: EventLogCategory;
}
