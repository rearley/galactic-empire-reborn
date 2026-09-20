/**
 * The redeploy notice goes to EVERY socket, `set filter on` included.
 *
 * The only galaxy-wide primitive canon has is
 * GEMAIN.C:1517 `outwar(int filter,unsigned exclude,unsigned freq)`, FILTER
 * class — a player running `set filter on` silences it, which is what
 * ai-arrival-broadcast.spec.ts pins for CYBNEW. This deliberately does NOT
 * follow it. Everything canon sends that way is in-fiction chatter; this is
 * out-of-fiction news that the player's session is about to end, and filtering
 * it would surprise exactly the players who filtered.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
import { makeGateway } from '../helpers/make-gateway';
import { DeployPhase, DEPLOY_NOTICE_TEXT } from '../../src/gateway/deploy-notice.messages';
import type { DeployNoticeService } from '../../src/gateway/deploy-notice.service';

interface Emit { rooms: string[]; except: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const announce = vi.fn();
  const chain = (rooms: string[], except: string[]) => ({
    to: (r: string) => chain([...rooms, r], except),
    except: (e: string[]) => chain(rooms, [...except, ...e]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, except, event, payload }); },
  });
  const gateway = makeGateway({
    deployNotice: { announce } as unknown as DeployNoticeService,
  });
  (gateway as unknown as { server: unknown }).server = {
    to: (r: string) => chain([r], []),
    except: (e: string[]) => chain([], e),
    emit: (event: string, payload: unknown) => { emits.push({ rooms: [], except: [], event, payload }); },
  };
  return { gateway, emits, announce };
}

const handleNotice = (gateway: unknown) =>
  (gateway as { handleDeployNotice: (p: unknown) => void }).handleDeployNotice.bind(gateway);

const shutdown = (gateway: unknown) =>
  (gateway as { beforeApplicationShutdown: () => void }).beforeApplicationShutdown.bind(gateway);

describe('deploy notice broadcast', () => {
  it('reaches every socket — no room, and no filter exclusion', () => {
    const { gateway, emits } = build();

    handleNotice(gateway)({
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
    });

    expect(emits).toHaveLength(1);
    const line = emits[0];
    expect(line.event).toBe('event.log');
    expect(line.rooms).toEqual([]);
    // THE assertion. CYBNEW excludes filteredRooms(); this must not, or a
    // filtered player is bounced with no warning at all.
    expect(line.except).toEqual([]);
    expect(line.payload).toEqual({
      category: 'alert',
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
    });
  });

  it('carries whatever category the payload names, not a hardcoded one', () => {
    const { gateway, emits } = build();

    handleNotice(gateway)({
      phase: DeployPhase.INBOUND,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.INBOUND],
      category: 'system',
    });

    expect(emits[0].payload).toMatchObject({ category: 'system' });
  });

  it('says the sign-off line on shutdown', () => {
    const { gateway, announce } = build();

    shutdown(gateway)();

    expect(announce).toHaveBeenCalledWith(DeployPhase.DOWN);
  });

  it('never lets a broken notice block a shutdown', () => {
    const { gateway, announce } = build();
    announce.mockImplementation(() => { throw new Error('boom'); });

    expect(() => shutdown(gateway)()).not.toThrow();
  });
});
