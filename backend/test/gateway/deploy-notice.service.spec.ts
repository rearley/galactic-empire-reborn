import { DeployNoticeService } from '../../src/gateway/deploy-notice.service';
import { DeployPhase, DEPLOY_NOTICE_TEXT, IMMINENT_COUNTDOWN_SECONDS } from '../../src/gateway/deploy-notice.messages';
import { DEPLOY_NOTICE } from '../../src/gateway/deploy-notice.events';
import type { PresenceService } from '../../src/public/presence.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

const build = (online: number) => {
  const emitter = { emit: vi.fn() };
  const presence = { count: () => online };
  const service = new DeployNoticeService(
    presence as unknown as PresenceService,
    emitter as unknown as EventEmitter2,
  );
  return { service, emitter };
};

describe('DeployNoticeService', () => {
  it('emits the phase payload when someone is in-game', () => {
    const { service, emitter } = build(2);

    const result = service.announce(DeployPhase.IMMINENT);

    expect(emitter.emit).toHaveBeenCalledWith(DEPLOY_NOTICE, {
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
      seconds: IMMINENT_COUNTDOWN_SECONDS,
    });
    expect(result).toEqual({ notified: 2, text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT] });
  });

  it('emits NOTHING when the galaxy is empty', () => {
    // Not merely cosmetic. The pre-update hook sleeps for as long as the server
    // says, and the server says zero here — so an unattended deploy is never
    // slowed by 45 seconds of courtesy nobody receives.
    const { service, emitter } = build(0);

    const result = service.announce(DeployPhase.INBOUND);

    expect(emitter.emit).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, text: null });
  });

  it('carries the right copy and category for every phase', () => {
    for (const phase of Object.values(DeployPhase)) {
      const { service, emitter } = build(1);
      service.announce(phase);
      expect(emitter.emit).toHaveBeenCalledWith(
        DEPLOY_NOTICE,
        expect.objectContaining({ phase, text: DEPLOY_NOTICE_TEXT[phase] }),
      );
    }
  });

  it('gives a countdown ONLY for the imminent phase', () => {
    // The banner ticks this down. `inbound` has no honest number to give - CI
    // cannot know when watchtower will pull - and the sign-off is already too
    // late to count anything, so both are 0 and the banner shows no timer.
    for (const phase of [DeployPhase.INBOUND, DeployPhase.DOWN]) {
      const { service, emitter } = build(1);
      service.announce(phase);
      expect(emitter.emit).toHaveBeenCalledWith(
        DEPLOY_NOTICE,
        expect.objectContaining({ seconds: 0 }),
      );
    }
  });
});
