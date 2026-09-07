/**
 * One kill in six hands the victor a list of the victim's colonies.
 *
 *   #ifdef SHOWDOC
 *   if (gernd()%RNDDOC == 0) {
 *       ...
 *       if (qeqbtv(ptr->userid,1)) {
 *           prfmsg(CAPTDOC);
 *           i = 0;
 *           do {
 *               gcrbtv(&planet,1);
 *               if (sameas(planet.userid,ptr->userid)) {
 *                   prf("%-20s %d %d   %d \r",planet.name,planet.xsect,planet.ysect,planet.plnum);
 *                   outprfge(ALWAYS,who);
 *               } else break;
 *           } while (qnxbtv() && (++i < 20));
 *       }
 *   }
 *   #endif
 *
 * @see GEFUNCS.C:1227-1251, inside killem
 * @see GEMAIN.H:192 `#define SHOWDOC 1` — compiled IN
 * @see GEMAIN.H:193 `#define RNDDOC 6`
 *
 * `ptr` is the VICTIM, so what you capture is a list of THEIR planets, sent to
 * `who` — the killer — on ALWAYS. It is real intelligence: where to raid next.
 * The port implemented none of it; CAPTDOC sat unreferenced in the string
 * table, and SHOWDOC is not an optional feature — the #define is on.
 *
 * The 20-row cap is canon's, and it is a cap on the LISTING, not a sample: the
 * loop takes planets in table order and stops.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PresenceService } from '../../src/public/presence.service';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build(planets: Array<{ name: string; xsect: number; ysect: number; plnum: number }>, roll: number) {
  const emits: Emit[] = [];
  const findMany = jest.fn().mockResolvedValue(planets);
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  const gateway = new GameGateway(
    {} as never, {} as never, {} as never, {} as never,
    { planet: { findMany } } as unknown as PrismaService,
    {} as never, {} as never, {} as never,
    { next: () => roll } as never,
    { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
  );
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits, findMany };
}

const reveal = (g: GameGateway, victimUserid: string, killerUserid: string) =>
  (g as unknown as {
    revealCapturedDocument: (v: string, k: string) => Promise<void>;
  }).revealCapturedDocument(victimUserid, killerUserid);

const colony = (n: number) => ({ name: `Colony ${n}`, xsect: n, ysect: -n, plnum: 1 });

describe('captured documents (GEFUNCS.C:1227)', () => {
  it('lists the VICTIM\'s planets to the killer, one in six', async () => {
    const { gateway, emits } = build([colony(1), colony(2)], 0);

    await reveal(gateway, 'usr_victim', 'usr_killer');

    expect(emits[0].rooms).toEqual(['user:usr_killer']);
    expect((emits[0].payload as { text: string }).text)
      .toBe(formatMessage(MessageId.CAPTURED_DOC));
    expect(emits.map((e) => (e.payload as { text: string }).text).join('\n'))
      .toContain('Colony 2');
  });

  it('says nothing on the other five kills in six', async () => {
    const { gateway, emits, findMany } = build([colony(1)], 0.5);

    await reveal(gateway, 'usr_victim', 'usr_killer');

    expect(emits).toHaveLength(0);
    // and does not even ask the database
    expect(findMany).not.toHaveBeenCalled();
  });

  it('says nothing when the victim owns no planets', async () => {
    const { gateway, emits } = build([], 0);

    await reveal(gateway, 'usr_victim', 'usr_killer');

    expect(emits).toHaveLength(0);
  });

  it('caps the listing at canon 20 rows', async () => {
    const many = Array.from({ length: 40 }, (_, i) => colony(i + 1));
    const { gateway, emits, findMany } = build(many.slice(0, 20), 0);

    await reveal(gateway, 'usr_victim', 'usr_killer');

    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 20 });
    // one CAPTDOC header plus at most 20 rows
    expect(emits.length).toBeLessThanOrEqual(21);
  });

  it('does nothing at all when there is no killer to hand it to', async () => {
    // An AI or environmental kill: canon's `who` is the firing channel, and a
    // gravity crash sets none. @see GEFUNCS.C:1105
    const { gateway, emits, findMany } = build([colony(1)], 0);

    await reveal(gateway, 'usr_victim', '');

    expect(emits).toHaveLength(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
