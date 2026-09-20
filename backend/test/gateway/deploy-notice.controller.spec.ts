import { BadRequestException } from '@nestjs/common';
import { DeployNoticeController } from '../../src/gateway/deploy-notice.controller';
import { DeployPhase, IMMINENT_COUNTDOWN_SECONDS } from '../../src/gateway/deploy-notice.messages';
import type { DeployNoticeService } from '../../src/gateway/deploy-notice.service';

const build = (notified = 1) => {
  const service = { announce: vi.fn(() => ({ notified, text: 'x' })) };
  return {
    controller: new DeployNoticeController(service as unknown as DeployNoticeService),
    service,
  };
};

describe('POST /admin/deploy/notice', () => {
  it('announces the inbound phase and asks for no countdown', () => {
    const { controller, service } = build(3);

    expect(controller.notice({ phase: 'inbound' })).toEqual({ notified: 3, countdownSeconds: 0 });
    expect(service.announce).toHaveBeenCalledWith(DeployPhase.INBOUND);
  });

  it('tells the caller how long to hold the deploy open when players are on', () => {
    const { controller } = build(2);

    expect(controller.notice({ phase: 'imminent' })).toEqual({
      notified: 2,
      countdownSeconds: IMMINENT_COUNTDOWN_SECONDS,
    });
  });

  it('asks for NO countdown when the galaxy is empty', () => {
    // The hook sleeps for exactly `countdownSeconds`, so this is what keeps an
    // unattended deploy from being slowed by 45 seconds nobody would hear.
    const { controller } = build(0);

    expect(controller.notice({ phase: 'imminent' })).toEqual({ notified: 0, countdownSeconds: 0 });
  });

  it('refuses a phase that is not a warning', () => {
    // 'down' belongs to the shutdown hook. Over HTTP it would let a caller tell
    // every player comms were lost while the server carried on running.
    const { controller, service } = build();

    expect(() => controller.notice({ phase: 'down' })).toThrow(BadRequestException);
    expect(() => controller.notice({ phase: 'nonsense' })).toThrow(BadRequestException);
    expect(() => controller.notice({})).toThrow(BadRequestException);
    expect(service.announce).not.toHaveBeenCalled();
  });
});
