/**
 * A ship-loss notice must say what actually killed you.
 *
 * Round 5, two players independently: the live event was unambiguous —
 * `## DESTROYED victim=… attacker=none weapon=none`, preceded by "You have
 * flown into planet 1" — and the mail still read *"your ship was destroyed by
 * an unknown assailant."* The server knew exactly what happened and the
 * mailbox invented an enemy.
 *
 * Canon cannot arbitrate the wording: this mail is port-original. `warhupa`
 * sets GESTAT_AVAIL on hangup (GEMAIN.C:1434), so an offline ship is not in the
 * universe and cannot be killed — the situation the mail exists for is one the
 * original cannot reach. What canon DOES settle is that a gravity crash has no
 * killer: `ptr->damage = 101.0` at GEFUNCS.C:887 sets no `lastfired`, and
 * `killem`'s attribution block is guarded on `who >= 0` (GEFUNCS.C:1105). Canon
 * credits nobody, so neither do we — but we say what happened instead of
 * inventing someone.
 */
import { formatDetail } from '../../src/game/mail/mail-render';
import type { MailListEntry } from '../../src/game/mail/mail.types';

function lossEntry(over: Record<string, unknown>): MailListEntry {
  return {
    index: 1,
    class: 4,
    topic: 'SHIP LOST',
    dtime: '2026-09-04',
    sender: '(system)',
    payload: {
      kind: 'ship_loss',
      sectorX: 3,
      sectorY: -7,
      killer: 'an unknown assailant',
      ...over,
    },
  } as unknown as MailListEntry;
}

const text = (e: MailListEntry): string => formatDetail(e).join('\n');

describe('ship-loss notice names the real cause', () => {
  it('still names a killer when there was one', () => {
    expect(text(lossEntry({ killer: 'Trans-Gal #2128' })))
      .toContain('destroyed by Trans-Gal #2128');
  });

  it('reports a collision as a collision, not an assailant', () => {
    const out = text(lossEntry({ cause: 'gravity', killer: 'planet 1' }));
    expect(out).toContain('flew into planet 1');
    expect(out).not.toMatch(/destroyed by/);
    expect(out).not.toMatch(/assailant/);
  });


  it('falls back to the unknown wording only when the cause is genuinely unknown', () => {
    // A killer who logged off in the same tick still lands here, and that is
    // honest — we really do not know.
    expect(text(lossEntry({}))).toContain('an unknown assailant');
  });
});

/**
 * The renderer can only tell the truth if the cause survives the whole chain:
 * physics tick records it on the ship → kill resolution puts it on the event →
 * the mail service picks a message type → the inbox maps it back.
 *
 * Every previous version of this bug lived in a gap between two of those steps,
 * so this asserts the joins rather than the ends.
 */
import { ShipLossMailService, MESG_SHIPLOSS, MESG_SHIPLOSS_GRAVITY } from '../../src/game/player/ship-loss-mail.service';
import type { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';

describe('collision cause survives the whole mail chain', () => {
  const destroyed = (over: Partial<CombatShipDestroyedEvent>): CombatShipDestroyedEvent => ({
    victimId: 'usr_a:1', victimShipKey: 'usr_a:1', victimUserid: 'usr_a',
    attackerId: null, attackerShipKey: null, attackerUserid: null,
    attackerChannel: -1, weapon: null, attackerName: null,
    sector: { x: 3, y: -7 }, tickAt: new Date(), loot: [], scoreAwarded: 0,
    ...over,
  } as CombatShipDestroyedEvent);

  const build = () => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = { mailStat: { create: (a: { data: Record<string, unknown> }) => { created.push(a.data); return Promise.resolve({}); } } } as never;
    const svc = new ShipLossMailService({ on: vi.fn() } as never, prisma);
    return { svc, created };
  };

  it('files a collision under the gravity type, naming the body', async () => {
    const { svc, created } = build();
    await (svc as unknown as { handle: (e: CombatShipDestroyedEvent) => Promise<void> })
      .handle(destroyed({ cause: 'gravity', attackerName: 'planet 1' }));
    expect(created[0]?.type).toBe(MESG_SHIPLOSS_GRAVITY);
    expect(created[0]?.name1).toBe('planet 1');
  });

  it('leaves an ordinary kill on the ordinary type', async () => {
    const { svc, created } = build();
    await (svc as unknown as { handle: (e: CombatShipDestroyedEvent) => Promise<void> })
      .handle(destroyed({ attackerName: 'Trans-Gal #2128' }));
    expect(created[0]?.type).toBe(MESG_SHIPLOSS);
    expect(created[0]?.name1).toBe('Trans-Gal #2128');
  });
});
