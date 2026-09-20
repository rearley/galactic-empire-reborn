import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../game/midnight/admin-token.guard';
import { DeployNoticeService } from './deploy-notice.service';
import { DeployPhase, IMMINENT_COUNTDOWN_SECONDS } from './deploy-notice.messages';

interface NoticeBody {
  phase?: string;
}

interface NoticeResponse {
  notified: number;
  /** How long the caller should hold the deploy open. Zero means do not wait. */
  countdownSeconds: number;
}

/**
 * The two WARNING phases, and only those.
 *
 * `down` is missing on purpose: it belongs to the gateway's shutdown hook, and
 * accepting it here would let a caller tell every player comms were lost while
 * the server carried on running.
 */
const OVER_HTTP: Record<string, DeployPhase> = {
  inbound: DeployPhase.INBOUND,
  imminent: DeployPhase.IMMINENT,
};

/**
 * Lets a deploy tell the running game it is about to be replaced.
 *
 * Two callers, because they know different things. CI knows an image was
 * published but not when watchtower will pull it, so it sends `inbound` and the
 * copy stays vague. The pre-update hook runs when the container is genuinely
 * about to stop, so it sends `imminent` and gets a real countdown back.
 *
 * Guarded by the same bearer token as POST /admin/midnight/run. Reusing it is
 * deliberate: it is already the ops token, both endpoints sit at the same trust
 * level, and a second secret to rotate buys nothing. The MIDNIGHT_ name is a
 * pre-existing wart, kept rather than churn a production secret.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
@Controller('admin/deploy')
@UseGuards(AdminTokenGuard)
export class DeployNoticeController {
  constructor(private readonly notices: DeployNoticeService) {}

  @Post('notice')
  @HttpCode(HttpStatus.OK)
  notice(@Body() body: NoticeBody): NoticeResponse {
    const phase = OVER_HTTP[body.phase ?? ''];
    if (!phase) {
      throw new BadRequestException({
        code: 'BAD_PHASE',
        message: `phase must be one of: ${Object.keys(OVER_HTTP).join(', ')}`,
      });
    }

    const { notified } = this.notices.announce(phase);
    // The caller SLEEPS for this. Zero when nobody heard it, so an unattended
    // deploy is never slowed by a courtesy with no audience.
    const countdownSeconds =
      phase === DeployPhase.IMMINENT && notified > 0 ? IMMINENT_COUNTDOWN_SECONDS : 0;

    return { notified, countdownSeconds };
  }
}
