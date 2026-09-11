/**
 * Coming back from a death you were not online for.
 *
 * PORT-ORIGINAL situation, and therefore a design call rather than a canon
 * transcription: canon's `warhupa` sets GESTAT_AVAIL on hangup
 * (GEMAIN.C:1398-1440), so a logged-off ship is not in the universe and cannot
 * be shot — the case cannot arise there. Our 24/7 world creates it, and the
 * port handled it by dropping the captain at the ship-name prompt with no word
 * that they had lost a hull, let alone to whom. Three playtest personas hit it.
 *
 * The fix borrows canon's own habit: YOURDEAD (MBMGEMSG.MSG:2099-1840) never
 * lets a pilot discover a loss by inference. On re-entry, if a SHIP LOST mail
 * is still sitting unread in the inbox, say so in one line — killer, sector,
 * and where to read the rest.
 */
import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { MESG_SHIPLOSS } from '../../src/game/player/ship-loss-mail.service';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

describe('GameGateway — SHIP LOST notice on re-entry', () => {
  const build = (mailRow: unknown, ships: unknown[] = []) => {
    const mailFindFirst = jest.fn().mockResolvedValue(mailRow);
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: () => undefined,
    } as unknown as ShipStateService;

    const prisma = {
      ship: { findMany: jest.fn().mockResolvedValue(ships) },
      user: { findUnique: jest.fn().mockResolvedValue({ userid: 'usr_abc' }) },
      mailStat: { findFirst: mailFindFirst },
    } as unknown as PrismaService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      prisma,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: () => ({ emit: () => undefined }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };

    const emitted: Array<{ event: string; payload: unknown }> = [];
    const client = {
      id: 'sock-1',
      data: { userid: 'usr_abc' } as Record<string, unknown>,
      emit: (event: string, payload: unknown) => { emitted.push({ event, payload }); },
      join: jest.fn(),
      disconnect: jest.fn(),
      broadcast: { emit: jest.fn() },
    };
    const present = (gateway as unknown as {
      presentShipEntry: (c: unknown, u: string) => Promise<void>;
    }).presentShipEntry.bind(gateway);
    return { present, client, emitted, mailFindFirst };
  };

  const lossMail = {
    userid: 'usr_abc',
    class: 4,
    msgno: 1n,
    type: MESG_SHIPLOSS,
    topic: 'SHIP LOST',
    name1: 'Trans-Gal #2128',
    int1: 12,
    int2: 7,
  };

  it('tells a returning captain their ship was destroyed, by whom, and where to read it', async () => {
    const { present, client, emitted } = build(lossMail);
    await present(client, 'usr_abc');

    const texts = emitted
      .filter((e) => e.event === 'event.log')
      .map((e) => (e.payload as { text: string }).text);
    const notice = texts.find((t) => t.includes('Trans-Gal #2128'));
    expect(notice).toBeDefined();
    expect(notice).toContain('12');
    expect(notice).toContain('7');
    expect(notice).toContain("'rea'");
  });

  it('still reaches the ship-name prompt', async () => {
    const { present, client, emitted } = build(lossMail);
    await present(client, 'usr_abc');
    expect(emitted.some((e) => e.event === 'prompt:ship-name')).toBe(true);
  });

  it('says nothing when there is no ship-loss mail waiting', async () => {
    const { present, client, emitted } = build(null);
    await present(client, 'usr_abc');
    expect(emitted.some((e) => e.event === 'event.log')).toBe(false);
  });

  it('does not re-announce the loss once the captain has a hull again', async () => {
    // The mail row survives until the 7-day purge and MailStat has no read flag
    // (it mirrors canon's MAILSTAT struct, GEMAIN.H:531), so a mailbox-only
    // condition announced the same death on every login for a week. Having no
    // flyable ship is the self-clearing gate: name a new hull and this branch
    // is never reached again.
    // Two hulls, so entry stops at the ship-selection menu rather than
    // boarding — the notice decision has already been made by then either way.
    const { present, client, emitted, mailFindFirst } = build(lossMail, [
      { shipno: 1, shpclass: 1, shipname: 'Replacement', status: 1, xcoord: 0, ycoord: 0 },
      { shipno: 2, shpclass: 1, shipname: 'Spare', status: 1, xcoord: 0, ycoord: 0 },
    ]);
    await present(client, 'usr_abc');

    const texts = emitted
      .filter((e) => e.event === 'event.log')
      .map((e) => (e.payload as { text: string }).text);
    expect(texts.some((t) => t.includes('Trans-Gal #2128'))).toBe(false);
    expect(mailFindFirst).not.toHaveBeenCalled();
  });

  it('never blocks entry when the mailbox lookup fails', async () => {
    const { present, client, emitted, mailFindFirst } = build(null);
    mailFindFirst.mockRejectedValue(new Error('db down'));
    await present(client, 'usr_abc');
    expect(emitted.some((e) => e.event === 'prompt:ship-name')).toBe(true);
  });
});
