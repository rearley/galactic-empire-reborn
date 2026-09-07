/**
 * Each ship caught in a self-destruct is told, individually.
 *
 *   if (SHIELDUP) { damstr(damage); prfmsg(SELFD6,gechrbuf); outprfge(ALWAYS,zothusn); }
 *   else          { damstr(damage); prfmsg(SELFD7,gechrbuf); outprfge(ALWAYS,zothusn); }
 *
 * @see GEFUNCS.C:1878-1891
 *
 * Two distinct lines — shields deflecting the blast reads differently from
 * taking it bare — and the figure is a damstr WORD, not a number, as everywhere
 * else in canon's damage reporting.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { damstr } from '../../src/game/combat/combat-math';
import { CombatDestructBlastEvent } from '../../src/game/combat/combat-events';
import { PresenceService } from '../../src/public/presence.service';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = new GameGateway(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
  );
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

const fire = (gateway: GameGateway, e: CombatDestructBlastEvent) =>
  (gateway as unknown as { handleDestructBlast: (e: CombatDestructBlastEvent) => void })
    .handleDestructBlast(e);

describe('self-destruct blast reaches each victim (GEFUNCS.C:1878-1891)', () => {
  it('tells an unshielded victim with SELFD7', () => {
    const { gateway, emits } = build();

    fire(gateway, { victimId: 'usr_a:1', damage: 40, shieldUp: false, tickAt: new Date() });

    expect(emits[0].rooms).toEqual(['user:usr_a']);
    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.DESTRUCT_BLAST_HIT, damstr(40)),
    });
  });

  it('tells a shielded victim with SELFD6 instead', () => {
    const { gateway, emits } = build();

    fire(gateway, { victimId: 'usr_a:1', damage: 40, shieldUp: true, tickAt: new Date() });

    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.DESTRUCT_BLAST_DEFLECTED, damstr(40)),
    });
  });

  it('reports the damage as a word, as canon does everywhere else', () => {
    const { gateway, emits } = build();

    fire(gateway, { victimId: 'usr_a:1', damage: 40, shieldUp: false, tickAt: new Date() });

    const text = String((emits[0].payload as { text: string }).text);
    expect(text).toContain(damstr(40));
    expect(text).not.toContain('40');
  });
});
