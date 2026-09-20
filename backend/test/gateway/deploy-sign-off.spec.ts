import { EventEmitter } from 'node:events';
import { installDeploySignOff } from '../../src/gateway/deploy-sign-off';
import { DeployNoticeService } from '../../src/gateway/deploy-notice.service';
import { DeployPhase } from '../../src/gateway/deploy-notice.messages';

/**
 * The sign-off has to be sent BEFORE Nest starts tearing down.
 *
 * It began life as `GameGateway.beforeApplicationShutdown`, and measuring it
 * against a live server showed it reached nobody: by the time that hook runs
 * Nest has closed the sockets, PresenceService is empty and the service
 * correctly declines to say anything. The log read `deploy notice down: nobody
 * in-game` with a player connected a second earlier.
 *
 * So it moves to a signal listener registered before `enableShutdownHooks()`.
 * Node runs SIGTERM listeners in registration order, so ours fires first, while
 * the sockets are still open. Still best-effort — the packet races the close —
 * but now it has a chance, which the hook never did.
 */
const fakeApp = (service: unknown) => ({ get: vi.fn(() => service) });

describe('deploy sign-off on a signal', () => {
  it('announces DOWN when the process is asked to stop', () => {
    const announce = vi.fn();
    const proc = new EventEmitter();
    const app = fakeApp({ announce } as unknown as DeployNoticeService);

    installDeploySignOff(app as never, ['SIGTERM'], proc as never);
    proc.emit('SIGTERM');

    expect(app.get).toHaveBeenCalledWith(DeployNoticeService);
    expect(announce).toHaveBeenCalledWith(DeployPhase.DOWN);
  });

  it('listens on every signal it is given', () => {
    const announce = vi.fn();
    const proc = new EventEmitter();
    installDeploySignOff(
      fakeApp({ announce }) as never,
      ['SIGTERM', 'SIGINT'],
      proc as never,
    );

    proc.emit('SIGINT');

    expect(announce).toHaveBeenCalledWith(DeployPhase.DOWN);
  });

  it('NEVER throws, so a broken notice cannot stop the process exiting', () => {
    const proc = new EventEmitter();
    const app = { get: vi.fn(() => { throw new Error('no provider'); }) };

    installDeploySignOff(app as never, ['SIGTERM'], proc as never);

    expect(() => proc.emit('SIGTERM')).not.toThrow();
  });

  it('says it only once, however many signals arrive', () => {
    // A stuck container gets SIGTERM then SIGKILL, and some supervisors send
    // SIGTERM twice. Repeating the line would be the last thing a player saw.
    const announce = vi.fn();
    const proc = new EventEmitter();

    installDeploySignOff(fakeApp({ announce }) as never, ['SIGTERM', 'SIGINT'], proc as never);
    proc.emit('SIGTERM');
    proc.emit('SIGTERM');
    proc.emit('SIGINT');

    expect(announce).toHaveBeenCalledTimes(1);
  });
});
