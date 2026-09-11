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
import { DestroyedEmitter, ShipDestroyedService } from '../../src/gateway/ship-destroyed.service';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { Random } from '../../src/game/combat/random.port';

interface Emit { room: string; text: string }

function build(planets: Array<{ name: string; xsect: number; ysect: number; plnum: number }>, roll: number) {
  const emits: Emit[] = [];
  const findMany = jest.fn().mockResolvedValue(planets);
  const emit: DestroyedEmitter = {
    toRoom: (room, _category, text) => { emits.push({ room, text }); },
    toAllExcept: () => {},
    announceDestroyed: () => {},
    recoverVictim: () => Promise.resolve(),
  };
  const service = new ShipDestroyedService(
    { planet: { findMany } } as unknown as PrismaService,
    {} as unknown as ShipStateService,
    {} as unknown as ScanHandlerService,
    {} as unknown as ShipClassCacheService,
    { next: () => roll } as unknown as Random,
  );
  return { service, emit, emits, findMany };
}

const reveal = (
  h: { service: ShipDestroyedService; emit: DestroyedEmitter },
  victimUserid: string,
  killerUserid: string,
) => h.service.revealCapturedDocument(victimUserid, killerUserid, h.emit);

const colony = (n: number) => ({ name: `Colony ${n}`, xsect: n, ysect: -n, plnum: 1 });

describe('captured documents (GEFUNCS.C:1227)', () => {
  it('lists the VICTIM\'s planets to the killer, one in six', async () => {
    const h = build([colony(1), colony(2)], 0);

    await reveal(h, 'usr_victim', 'usr_killer');

    expect(h.emits[0].room).toBe('user:usr_killer');
    expect(h.emits[0].text)
      .toBe(formatMessage(MessageId.CAPTURED_DOC));
    expect(h.emits.map((e) => e.text).join('\n'))
      .toContain('Colony 2');
  });

  it('says nothing on the other five kills in six', async () => {
    const h = build([colony(1)], 0.5);

    await reveal(h, 'usr_victim', 'usr_killer');

    expect(h.emits).toHaveLength(0);
    // and does not even ask the database
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('says nothing when the victim owns no planets', async () => {
    const h = build([], 0);

    await reveal(h, 'usr_victim', 'usr_killer');

    expect(h.emits).toHaveLength(0);
  });

  it('caps the listing at canon 20 rows', async () => {
    const many = Array.from({ length: 40 }, (_, i) => colony(i + 1));
    const h = build(many.slice(0, 20), 0);

    await reveal(h, 'usr_victim', 'usr_killer');

    expect(h.findMany.mock.calls[0][0]).toMatchObject({ take: 20 });
    // one CAPTDOC header plus at most 20 rows
    expect(h.emits.length).toBeLessThanOrEqual(21);
  });

  it('does nothing at all when there is no killer to hand it to', async () => {
    // An AI or environmental kill: canon's `who` is the firing channel, and a
    // gravity crash sets none. @see GEFUNCS.C:1105
    const h = build([colony(1)], 0);

    await reveal(h, 'usr_victim', '');

    expect(h.emits).toHaveLength(0);
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
