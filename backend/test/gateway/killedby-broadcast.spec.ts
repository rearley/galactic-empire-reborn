/**
 * KILLEDBY — the galaxy-wide kill announcement.
 *
 * Canon: GEFUNCS.C:1116-1117
 *     prfmsg(KILLEDBY,username(ptr),username(wptr));
 *     outwar(FILTER,usrn,0);
 * `outwar` sends it to every pilot in the game. The prfmsg sits AFTER the
 * `if (wptr->status == GESTAT_AUTO)` branch at :1110, so an AI kill is
 * announced exactly like a player one. Text: MBMGEMSG.MSG:2122.
 *
 * `username()` (GEFUNCS.C:2596-2604) returns the SHIP name for a CYBORG or
 * DROID class and the USERID for everyone else — so the labels differ by who
 * the combatant is, and this spec pins both.
 *
 * The port implemented none of it: grep KILLEDBY over src/ returned nothing,
 * and a kill anywhere else in the galaxy was invisible.
 */
import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

describe('GameGateway — KILLEDBY galaxy broadcast', () => {
  const build = () => {
    const globalEmits: Array<{ event: string; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      removeFromGame: vi.fn(),
      get: (userid: string, shipno: number) => {
        if (userid === 'Cybrg-222' && shipno === 1) return { userid, shipno, shipname: 'Cybrg-49340', status: 2 } as never;
        if (userid === 'usr_abc' && shipno === 2) return { userid, shipno, shipname: 'Defiant', status: 1 } as never;
        if (userid === 'usr_kil' && shipno === 1) return { userid, shipno, shipname: 'Marauder', status: 1 } as never;
        return undefined;
      },
    } as unknown as ShipStateService;

    const prisma = {
      $transaction: vi.fn().mockResolvedValue(undefined),
      shipClass: { findFirst: vi.fn() },
    } as unknown as PrismaService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      prisma,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    // Canon's outwar excludes the victim's own channel (GEMAIN.C:1522), so the
    // double records WHICH room was excluded rather than flattening except()
    // into a plain broadcast — otherwise the test cannot see the exclusion.
    const excluded: string[] = [];
    (gateway as unknown as { server: unknown }).server = {
      emit: (event: string, payload: unknown) => { globalEmits.push({ event, payload }); },
      except: (rooms: string | string[]) => ({
        emit: (event: string, payload: unknown) => {
          // except() now also carries the MSG_FILTER opt-outs canon's
          // outwar(FILTER, ...) honours, so it takes a list.
          excluded.push(...(Array.isArray(rooms) ? rooms : [rooms]));
          globalEmits.push({ event, payload });
        },
      }),
      to: () => ({ emit: () => undefined }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, globalEmits, excluded };
  };

  const event = (over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent => ({
    victimId: 'usr_abc:2',
    attackerId: 'Cybrg-222:1',
    victimShipKey: 'usr_abc:2',
    attackerShipKey: 'Cybrg-222:1',
    victimUserid: 'usr_abc',
    attackerUserid: 'Cybrg-222',
    attackerName: 'Cybrg-49340',
    attackerChannel: 7,
    cause: null,
    sector: { x: 6, y: 9 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 500,
    ...over,
  });

  const fireFull = (e: CombatShipDestroyedEvent) => {
    const { gateway, globalEmits, excluded } = build();
    (gateway as unknown as { handleCombatShipDestroyed: (e: unknown) => void })
      .handleCombatShipDestroyed(e);
    return {
      texts: globalEmits
        .filter((g) => g.event === 'event.log')
        .map((g) => (g.payload as { text: string }).text),
      excluded,
    };
  };

  const fire = (e: CombatShipDestroyedEvent) => fireFull(e).texts;

  it('announces an AI kill to the whole galaxy, naming the Cybertron by ship name', () => {
    // KILLEDBY opens with a blank line and a *** banner in canon; assert on
    // the sentence rather than on the whole string.
    expect(fire(event()).join('\n')).toContain(
      "Commander usr_abc's ship was destroyed by Cybrg-49340!!!",
    );
  });

  it('names a human killer by userid, as username() does for a non-automaton', () => {
    expect(
      fire(event({ attackerId: 'usr_kil:1', attackerShipKey: 'usr_kil:1', attackerUserid: 'usr_kil', attackerName: 'Marauder' })).join('\n'),
    ).toContain("Commander usr_abc's ship was destroyed by usr_kil!!!");
  });

  it('does not announce the kill to the pilot who died — canon excludes them', () => {
    // outwar(FILTER, usrn, 0) at GEFUNCS.C:1117 passes the VICTIM's channel as
    // the exclude argument, and GEMAIN.C:1522 skips it. The victim gets
    // YOURDEAD instead, which says they survived.
    const { texts, excluded } = fireFull(event());
    expect(texts.join('\n')).toContain("Commander usr_abc's ship was destroyed by Cybrg-49340!!!");
    expect(excluded).toContain('user:usr_abc');
  });

  it('does not use KILLEDBY when there is no killer — that is DIED\'s branch', () => {
    const texts = fire(event({
      attackerId: null, attackerShipKey: null, attackerUserid: null, attackerName: null, attackerChannel: -1,
    }));
    expect(texts.some((t) => t.includes('was destroyed by'))).toBe(false);
  });
});

/**
 * DIED — the OTHER half of canon's kill announcement.
 *
 * `killem` branches on whether a ship fired the fatal shot (GEFUNCS.C:1104):
 *
 *     if (who >= 0 && who < nships && who != usrn)   → KILLEDBY
 *     else  prfmsg(DIED,ptr->shipname,username(ptr));
 *           outwar(ALWAYS,usrn,0);                    (GEFUNCS.C:1262-1264)
 *
 * So a death with no killer is NOT silent — it is announced galaxy-wide, and
 * with ALWAYS rather than FILTER, so it reaches even pilots who have muted the
 * galaxy feed. That covers a self-destruct, a gravity crash, and a colony's ion
 * cannons (fireion sets lastfired to -1, GEFUNCS.C:1797), which is every death
 * that does not come from another ship.
 *
 * The port emitted nothing here. The React client filled the silence with a
 * line of its own whose fallback printed `event.victimUserid` — the internal
 * `Cybrg-NNN` account name that canon's `username()` exists precisely to hide.
 * Reported from play: "Cybrg-222 has been destroyed!", a name no pilot should
 * ever see.
 */
describe('GameGateway — DIED, the killer-less death', () => {
  const build = () => {
    const globalEmits: Array<{ event: string; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => [{ userid: 'usr_muted', shipno: 1, msgFilter: true }],
      findByUserid: () => [],
      removeFromGame: vi.fn(),
      get: (userid: string, shipno: number) => {
        if (userid === 'Cybrg-222' && shipno === 1) return { userid, shipno, shipname: 'Cyberquad 44135', status: 2 } as never;
        if (userid === 'usr_abc' && shipno === 2) return { userid, shipno, shipname: 'Defiant', status: 1 } as never;
        return undefined;
      },
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      prisma: { $transaction: vi.fn().mockResolvedValue(undefined), shipClass: { findFirst: vi.fn() } } as unknown as PrismaService,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    const excluded: string[] = [];
    (gateway as unknown as { server: unknown }).server = {
      emit: (event: string, payload: unknown) => { globalEmits.push({ event, payload }); },
      except: (rooms: string | string[]) => ({
        emit: (event: string, payload: unknown) => {
          excluded.push(...(Array.isArray(rooms) ? rooms : [rooms]));
          globalEmits.push({ event, payload });
        },
      }),
      to: () => ({ emit: () => undefined }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, globalEmits, excluded };
  };

  const fire = (over: Partial<CombatShipDestroyedEvent>) => {
    const { gateway, globalEmits, excluded } = build();
    (gateway as unknown as { handleCombatShipDestroyed: (e: unknown) => void })
      .handleCombatShipDestroyed({
        victimId: 'Cybrg-222:1',
        attackerId: null,
        victimShipKey: 'Cybrg-222:1',
        attackerShipKey: null,
        victimUserid: 'Cybrg-222',
        attackerUserid: null,
        attackerName: null,
        attackerChannel: -1,
        weapon: null,
        sector: { x: 6, y: 9 },
        tickAt: new Date(),
        loot: [],
        scoreAwarded: 0,
        ...over,
      });
    return {
      texts: globalEmits.filter((g) => g.event === 'event.log')
        .map((g) => (g.payload as { text: string }).text),
      excluded,
    };
  };

  it('announces an AI death by SHIP name, never by the Cybrg-NNN account', () => {
    const joined = fire({}).texts.join('\n');
    expect(joined).toContain('The Cyberquad 44135, Commanded by Cyberquad 44135 has been destroyed!!!');
    expect(joined).not.toContain('Cybrg-222');
  });

  it('names a human by userid, as username() does for a non-automaton', () => {
    const joined = fire({
      victimId: 'usr_abc:2', victimShipKey: 'usr_abc:2', victimUserid: 'usr_abc',
    }).texts.join('\n');
    expect(joined).toContain('The Defiant, Commanded by usr_abc has been destroyed!!!');
  });

  it('reaches pilots who muted the galaxy feed — canon sends this one ALWAYS', () => {
    // outwar(ALWAYS,...) bypasses the MSG_FILTER check that outwar(FILTER,...)
    // honours. @see GEMAIN.C:2557-2567. Only the victim is excluded.
    const { excluded } = fire({});
    expect(excluded).not.toContain('user:usr_muted');
    expect(excluded).toContain('user:Cybrg-222');
  });

  it('announces an ion-cannon kill, which has no attacking ship', () => {
    expect(fire({ cause: 'ion', attackerName: 'New Ceylon' }).texts.join('\n'))
      .toContain('has been destroyed!!!');
  });
});
