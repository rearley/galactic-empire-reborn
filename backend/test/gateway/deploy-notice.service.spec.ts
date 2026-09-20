import { DeployNoticeService } from '../../src/gateway/deploy-notice.service';
import { DeployPhase, DEPLOY_NOTICE_TEXT } from '../../src/gateway/deploy-notice.messages';
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
});
