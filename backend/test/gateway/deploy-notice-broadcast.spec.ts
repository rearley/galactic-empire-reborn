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

interface Emit { rooms: string[]; except: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const chain = (rooms: string[], except: string[]) => ({
    to: (r: string) => chain([...rooms, r], except),
    except: (e: string[]) => chain(rooms, [...except, ...e]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, except, event, payload }); },
  });
  const gateway = makeGateway();
  (gateway as unknown as { server: unknown }).server = {
    to: (r: string) => chain([r], []),
    except: (e: string[]) => chain([], e),
    emit: (event: string, payload: unknown) => { emits.push({ rooms: [], except: [], event, payload }); },
  };
  return { gateway, emits };
}

const handleNotice = (gateway: unknown) =>
  (gateway as { handleDeployNotice: (p: unknown) => void }).handleDeployNotice.bind(gateway);

describe('deploy notice broadcast', () => {
  it('reaches every socket — no room, and no filter exclusion', () => {
    const { gateway, emits } = build();

    handleNotice(gateway)({
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
      seconds: 45,
    });

    const line = emits.filter((e) => e.event === 'event.log')[0];
    expect(line).toBeDefined();
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
      seconds: 0,
    });

    expect(emits.filter((e) => e.event === 'event.log')[0].payload)
      .toMatchObject({ category: 'system' });
  });

  it('ALSO emits deploy.notice, carrying the countdown for the banner', () => {
    // The log line is the record; the banner is what gets it noticed. The first
    // production deploy to warn anyone reached two players and one of them
    // missed it entirely, because a log scrolls and they were not watching it.
    const { gateway, emits } = build();

    handleNotice(gateway)({
      phase: DeployPhase.IMMINENT,
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      category: 'alert',
      seconds: 45,
    });

    const banner = emits.filter((e) => e.event === 'deploy.notice')[0];
    expect(banner).toBeDefined();
    expect(banner.except).toEqual([]);
    expect(banner.payload).toEqual({
      phase: 'imminent',
      text: DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT],
      seconds: 45,
    });
  });

});
