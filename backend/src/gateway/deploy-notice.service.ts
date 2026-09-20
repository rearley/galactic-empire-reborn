import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceService } from '../public/presence.service';
import { DeployPhase, DEPLOY_NOTICE_TEXT, DEPLOY_NOTICE_CATEGORY, IMMINENT_COUNTDOWN_SECONDS } from './deploy-notice.messages';
import { DEPLOY_NOTICE, type DeployNoticeEvent } from './deploy-notice.events';

/**
 * Announces an imminent redeploy to everyone in-game.
 *
 * PORT-ORIGINAL — canon had no redeploy and no way to tell a player about one.
 * @see deploy-notice.messages.ts, docs/DECISIONS.md 2026-09-20
 *
 * Emits rather than broadcasting directly: the HTTP caller must not hold the
 * Socket.io server. `GameGateway` listens for DEPLOY_NOTICE.
 */
@Injectable()
export class DeployNoticeService {
  private readonly logger = new Logger(DeployNoticeService.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Returns how many players the notice reached.
   *
   * ZERO IS A NORMAL ANSWER, and it is load-bearing rather than informational:
   * the pre-update hook reads it to decide whether to hold the deploy open for
   * the countdown at all.
   */
  announce(phase: DeployPhase): { notified: number; text: string | null } {
    const notified = this.presence.count();
    if (notified === 0) {
      this.logger.log(`deploy notice ${phase}: nobody in-game, saying nothing`);
      return { notified: 0, text: null };
    }

    const text = DEPLOY_NOTICE_TEXT[phase];
    const payload: DeployNoticeEvent = {
      phase,
      text,
      category: DEPLOY_NOTICE_CATEGORY[phase],
      // Only IMMINENT has a number anyone can stand behind: watchtower blocks
      // on the hook for exactly this long. CI cannot know when watchtower will
      // pull, and the sign-off is already too late to count anything down, so
      // both are 0 and the banner shows no timer.
      seconds: phase === DeployPhase.IMMINENT ? IMMINENT_COUNTDOWN_SECONDS : 0,
    };
    this.events.emit(DEPLOY_NOTICE, payload);
    this.logger.log(`deploy notice ${phase}: told ${notified} player(s)`);
    return { notified, text };
  }
}
