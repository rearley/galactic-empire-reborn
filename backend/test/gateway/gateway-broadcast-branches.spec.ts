import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { PresenceService } from '../../src/public/presence.service';
import { BEACON_EVENT } from '../../src/gateway/events/beacon.event';
import { CYBERTRON_EVENT } from '../../src/game/cybertron/cybertron-events';
import { GESTAT_AVAIL, GESTAT_USER, GESTAT_AUTO, UNIVMAX } from '../../src/game/constants';
import { Random } from '../../src/game/combat/random.port';
import { mockRandom } from '../fixtures/mock-random';

/**
 * The gateway's BROADCAST AND SCOPING decisions — who is addressed, and in
 * which room.
 *
 * This slice has a security history. Every case below is a fork where the wrong
 * arm sends a message to a room the recipient is not in (so it is lost), or to
 * a room full of people who should not have it (so a position, a hull's
 * identity or an account key leaks). Rounds one and two pinned the payloads;
 * this file pins the ADDRESSING.
 *
 * Canon anchors, per branch:
 *   • KILLEDBY labels — `username()` returns the SHIP name for a CYBORG or
 *     DROID and the player's name for everyone else (GEFUNCS.C:2596-2604),
 *     and the announcement is `prfmsg(KILLEDBY,username(ptr),username(wptr))`
 *     (GEFUNCS.C:1116).
 *   • Self-destruct countdown — two audiences: SELFD2 to the pilot every tick,
 *     SELFD2A/2B/2C to the sector at 10, 5 and 2 only (GEFUNCS.C:1833-1852).
 *   • Shield charge — `outprfge(FILTER,usrn)`, the captain's own terminal, not
 *     a sector broadcast (GEFUNCS.C:2515-2523).
 *   • Tuned / hail / single-terminal sends — `outsect`/`outwar`/`outprfge`
 *     (GEMAIN.C:1518-1540, GECMDS.C:2280).
 *
 * The beacon-on-move gate is labelled CHARACTERIZATION where noted: canon's
 * beacon is a per-user message shown to a pilot standing in the sector
 * (GEFUNCS.C:808-816), and the port re-emits it on arrival behind an
 * "is anyone here to see it" test of its own (audit 020 F-005). These cases pin
 * the port's rule, not a transcription of C.
 *
 * @see test/gateway/snapshot-broadcast-scoping.spec.ts (the roster fan-out)
 * @see test/gateway/destroyed-payload-scoping.spec.ts (the death payload)
 * @see test/gateway/room-name-coverage.spec.ts (the room NAMESPACE)
 */

interface FakeShip {
  userid: string;
  shipno: number;
  shipname: string;
  username?: string;
  status: number;
  speed: number;
  xcoord: number;
  ycoord: number;
  freq: number[];
  msgFilter: boolean;
}

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
}

interface RoomEmit {
  room: string;
  event: string;
  payload: unknown;
}

const ship = (over: Partial<FakeShip> & { userid: string; shipno: number }): FakeShip => ({
  shipname: `Hull-${over.userid}`,
  status: GESTAT_USER,
  speed: 100,
  xcoord: 0,
  ycoord: 0,
  freq: [0, 0, 0],
  msgFilter: false,
  ...over,
});

const build = (random: Random = mockRandom) => {
  const ships = new Map<string, FakeShip>();
  const sockets = new Map<string, FakeSocket>();
  const rooms = new Map<string, Set<string>>();
  const roomEmits: RoomEmit[] = [];
  const globalEmits: Array<{ event: string; payload: unknown }> = [];
  const excluded: string[] = [];

  const shipStateService = {
    findAllShips: () => [...ships.values()],
    findByUserid: () => [],
    removeFromGame: jest.fn(),
    get: (userid: string, shipno: number) => ships.get(`${userid}:${shipno}`),
  } as unknown as ShipStateService;

  const registry = new ConnectedShipsRegistry(shipStateService);

  const gateway = new GameGateway(
    shipStateService,
    { dispatch: jest.fn() } as unknown as CommandRouterService,
    registry,
    { validate: jest.fn() } as unknown as WsAuthGuard,
    {
      $transaction: jest.fn().mockResolvedValue(undefined),
      shipClass: { findFirst: jest.fn() },
      ship: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { update: jest.fn() },
    } as unknown as PrismaService,
    {} as unknown as OnboardingService,
    { clearScantab: jest.fn() } as unknown as ScanHandlerService,
    { getTypeName: () => 'Interceptor' } as never,
    random,
    { emit: jest.fn(), on: jest.fn() } as never,
    new PresenceService(),
  );

  const target = (room: string): Record<string, unknown> => ({
    emit: (event: string, payload: unknown) => { roomEmits.push({ room, event, payload }); },
    to: (next: string) => target(`${room}+${next}`),
    except: (id: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room: `${room}!except:${id}`, event, payload });
      },
    }),
  });

  (gateway as unknown as { server: unknown }).server = {
    emit: (event: string, payload: unknown) => { globalEmits.push({ event, payload }); },
    to: (room: string) => target(room),
    except: (rms: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        excluded.push(...(Array.isArray(rms) ? rms : [rms]));
        globalEmits.push({ event, payload });
      },
    }),
    sockets: { sockets, adapter: { rooms } },
  };

  const addShip = (s: FakeShip): FakeShip => {
    ships.set(`${s.userid}:${s.shipno}`, s);
    return s;
  };

  const addSocket = (id: string, userid: string, shipno: number): FakeSocket => {
    const sock: FakeSocket = {
      id,
      data: { userid, activeShipNo: shipno },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };
    sockets.set(id, sock);
    return sock;
  };

  return { gateway, registry, ships, sockets, rooms, roomEmits, globalEmits, excluded, addShip, addSocket };
};

type Harness = ReturnType<typeof build>;

const texts = (h: Harness, source: 'global' | 'room'): string[] =>
  (source === 'global' ? h.globalEmits : h.roomEmits)
    .filter((e) => e.event === 'event.log')
    .map((e) => (e.payload as { text: string }).text);

const received = (sock: FakeSocket, event: string): unknown[] =>
  sock.emit.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);

// ─────────────────────────────────────────────────────────────────────────────

describe('KILLEDBY — the label each side is announced under', () => {
  const destroy = (h: Harness, over: Record<string, unknown>): void => {
    void (h.gateway as unknown as {
      handleCombatShipDestroyed: (e: unknown) => Promise<void>;
    }).handleCombatShipDestroyed({
      victimId: 'usr_abc:2',
      attackerId: 'usr_kil:1',
      victimShipKey: 'usr_abc:2',
      attackerShipKey: 'usr_kil:1',
      victimUserid: 'usr_abc',
      attackerUserid: 'usr_kil',
      attackerName: null,
      attackerChannel: 7,
      weapon: 'phaser',
      sector: { x: 6, y: 9 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 500,
      ...over,
    });
  };

  /**
   * A player kills a Cybertron. `username()` returns the HULL name for a
   * CYBORG (GEFUNCS.C:2596-2604), so the galaxy hears the ship, never the
   * `Cybrg-NNN` slot name — the internal key that function exists to hide.
   *
   * The sibling case (AI killer, player victim) is pinned by
   * killedby-broadcast.spec.ts; this is the victim half of the same ternary.
   *
   * Mutation that breaks it: drop `isAiUserid(event.victimUserid)` from the
   * victimLabel ternary, so the AI falls through to the handle/userid arm.
   */
  it('names a destroyed Cybertron by its hull, not by its Cybrg slot', () => {
    const h = build();
    h.addShip(ship({ userid: 'Cybrg-222', shipno: 1, shipname: 'Cyberquad 44135', status: GESTAT_AUTO }));
    h.addShip(ship({ userid: 'usr_kil', shipno: 1, shipname: 'Marauder', username: 'Rick' }));

    destroy(h, {
      victimId: 'Cybrg-222:1',
      victimShipKey: 'Cybrg-222:1',
      victimUserid: 'Cybrg-222',
    });

    const line = texts(h, 'global').join('\n');
    expect(line).toContain('Cyberquad 44135');
    expect(line).toContain('Rick');
    expect(line).not.toContain('Cybrg-222');
  });

  /**
   * A player victim is named by their HANDLE. The account key reached the
   * galaxy feed once already — "destroyed by usr_27523ed6401c4e990dd98be2!!!"
   * — which is the disclosure `handleOf` was added to close.
   *
   * Mutation that breaks it: swap the arms of the victimLabel ternary, or drop
   * `victimHandle` in favour of `event.victimUserid`.
   */
  it('names a destroyed player by their handle, never by the account key', () => {
    const h = build();
    h.addShip(ship({ userid: 'usr_abc', shipno: 2, shipname: 'Defiant', username: 'Nova' }));
    h.addShip(ship({ userid: 'usr_kil', shipno: 1, shipname: 'Marauder', username: 'Rick' }));

    destroy(h, {});

    const line = texts(h, 'global').join('\n');
    expect(line).toContain('Nova');
    expect(line).not.toContain('usr_abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('self-destruct countdown — two audiences, one of them intermittent', () => {
  const tick = (h: Harness, sectorMessage: string | null): void =>
    (h.gateway as unknown as { handleDestructTick: (e: unknown) => void }).handleDestructTick({
      room: 'sector:4:-7',
      userid: 'usr_doomed',
      pilotMessage: 'Self destruct in 9 seconds.',
      sectorMessage,
      countdown: 9,
      shipId: 'usr_doomed:1',
    });

  /**
   * SELFD2A/2B/2C fire at 10, 5 and 2 only (GEFUNCS.C:1833-1852); the emitter
   * signals "not one of those ticks" with a null sectorMessage. Emitting
   * anyway would put an empty line into every bystander's log once a second —
   * and, worse, would announce a self-destruct nine seconds before canon does,
   * which is nine extra seconds for everyone nearby to clear the blast.
   *
   * Mutation that breaks it: drop the `event.sectorMessage !== null` guard.
   */
  it('says nothing to the sector on a tick canon is silent for', () => {
    const h = build();
    tick(h, null);

    expect(h.roomEmits.filter((e) => e.room === 'sector:4:-7')).toHaveLength(0);
  });

  /** The pilot hears the number on EVERY tick, whatever the sector hears. */
  it('always gives the pilot the countdown, in their own room', () => {
    const h = build();
    tick(h, null);

    const mine = h.roomEmits.filter((e) => e.room === 'user:usr_doomed');
    expect(mine).toHaveLength(1);
    expect((mine[0].payload as { text: string }).text).toBe('Self destruct in 9 seconds.');
  });

  /**
   * On a announced tick the sector line goes to the room the emitter chose —
   * the sector the doomed hull is in — and carries the sector text, not the
   * pilot's.
   *
   * Mutation that breaks it: send `event.pilotMessage` to the sector, or
   * address `user:${event.userid}` twice.
   */
  it('gives the sector its own line, in the room the event names', () => {
    const h = build();
    tick(h, 'A ship in this sector is about to self destruct!');

    const there = h.roomEmits.filter((e) => e.room === 'sector:4:-7');
    expect(there).toHaveLength(1);
    expect((there[0].payload as { text: string }).text).toBe(
      'A ship in this sector is about to self destruct!',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Cybertron break-off — the sector told is the TARGET’s, not the attacker’s', () => {
  const brokeOff = (h: Harness): void =>
    (h.gateway as unknown as { handleCybertronBrokeOff: (e: unknown) => void }).handleCybertronBrokeOff({
      attackerShipKey: 'Cybrg-9:1',
      targetShipKey: 'usr_prey:3',
      // The emitter fills this with the CYBERTRON's sector
      // (cybertron-tick.service.ts:420-424), which is not always the target's.
      sector: { x: 30, y: 30 },
      tickAt: 1,
    });

  const brokeOffRooms = (h: Harness): string[] =>
    h.roomEmits.filter((e) => e.event === CYBERTRON_EVENT.BROKE_OFF).map((e) => e.room);

  /**
   * CYBLUCK is for the pilot being let off the hook and the sector watching it
   * happen (GECYBS.C:258-260). Addressing the attacker's sector instead posts
   * the notice to a room the target is not in — so the people who saw the
   * chase hear nothing, and a room across the galaxy is told a Cybertron gave
   * up on someone.
   *
   * Mutation that breaks it: collapse the ternary to `event.sector`.
   */
  it('uses the target’s live sector when the target is still flying', () => {
    const h = build();
    h.addShip(ship({ userid: 'usr_prey', shipno: 3, xcoord: -11.8, ycoord: 42.2 }));

    brokeOff(h);

    // floor, not truncation: canon's `coord1` is floor (GECMDS.C:3102), so
    // -11.8 belongs to sector -12. Getting this wrong is how the neutral zone
    // once protected x in (-0.5, 0), which floors to sector -1.
    expect(brokeOffRooms(h)).toContain('sector:-12:42');
    expect(brokeOffRooms(h)).not.toContain('sector:30:30');
  });

  /**
   * The target has left memory between the AI tick and this handler (killed,
   * or logged out). The event's own sector is then the only address there is.
   *
   * Mutation that breaks it: collapse the ternary to the ship lookup, which
   * throws or addresses `sector:NaN:NaN`.
   */
  it('falls back to the event’s sector when the target is gone from state', () => {
    const h = build();

    brokeOff(h);

    expect(brokeOffRooms(h)).toContain('sector:30:30');
    expect(brokeOffRooms(h).join(' ')).not.toContain('NaN');
  });

  /** The pilot is addressed directly either way — a userid with no ship row still gets CYBLUCK. */
  it('still reaches the pilot’s own room when their hull is gone', () => {
    const h = build();

    brokeOff(h);

    expect(brokeOffRooms(h)).toContain('user:usr_prey');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sector transition — a mover the state no longer holds', () => {
  /**
   * The physics tick can emit a transition for a hull that combat evicted in
   * the same tick. Everything below the guard reads `movingShip.status`,
   * `.speed` and `.shipname`, so without it the handler throws inside an
   * event-emitter callback — and every emit after it in the tick is lost.
   *
   * Mutation that breaks it: delete `if (!movingShip) return;`.
   */
  it('emits nothing and does not throw', () => {
    const h = build();

    expect(() =>
      h.gateway.handleSectorTransition({
        shipId: 'usr_ghost:1',
        fromSector: { x: 1, y: 1 },
        toSector: { x: 2, y: 1 },
        x: 2.5,
        y: 1.5,
        tickAt: new Date(),
      }),
    ).not.toThrow();

    expect(h.roomEmits).toHaveLength(0);
    expect(h.globalEmits).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Beacon-on-move. CHARACTERIZATION of the port's gate: canon shows a sector's
 * beacon to a pilot standing in it, one time in ten (GEFUNCS.C:808-816); the
 * port re-emits it into the destination room on arrival, but only when there is
 * somebody there to see it. That "somebody" test is the branch here, and
 * getting it wrong publishes an arriving ship's name and both its sectors to a
 * room — the position disclosure this slice keeps having to close.
 *
 * `mockRandom.next()` is 0, so `gernd()%10 === 0` holds and the probability
 * gate is never what decides these cases.
 */
describe('beacon on arrival — who has to be watching', () => {
  const MOVER = 'usr_mover:1';

  const arrive = (h: Harness): void =>
    h.gateway.handleSectorTransition({
      shipId: MOVER,
      fromSector: { x: 5, y: 3 },
      toSector: { x: 6, y: 9 },
      x: 6.5,
      y: 9.5,
      tickAt: new Date(),
    });

  const beacons = (h: Harness): RoomEmit[] => h.roomEmits.filter((e) => e.event === BEACON_EVENT);

  const withMover = (h: Harness): FakeShip =>
    h.addShip(ship({ userid: 'usr_mover', shipno: 1, shipname: 'Wanderer', xcoord: 6.5, ycoord: 9.5 }));

  /**
   * The mover is standing in the destination sector by the time this runs, so
   * a predicate that forgets to exclude them makes every arrival its own
   * witness — a beacon on every boundary crossing, for a ship alone in empty
   * space.
   *
   * Mutation that breaks it: drop `shipKey(s.userid, s.shipno) !== shipId`.
   */
  it('does not let the arriving ship count as its own observer', () => {
    const h = build();
    withMover(h);

    arrive(h);

    expect(beacons(h)).toHaveLength(0);
  });

  /**
   * With a player already sitting there, the beacon goes to the DESTINATION
   * room. The flat sector ids are decoded back rather than recomputed, so the
   * assertion does not restate the encoding it is checking.
   *
   * Mutation that breaks it: address `sector:${fromSector...}`, or drop the
   * `hasObserver` early return so the room is right but the audience is empty.
   */
  it('fires into the destination room when a player is already there', () => {
    const h = build();
    withMover(h);
    h.addShip(ship({ userid: 'usr_watch', shipno: 1, xcoord: 6.1, ycoord: 9.9, status: GESTAT_USER }));

    arrive(h);

    const [beacon] = beacons(h);
    expect(beacon).toBeDefined();
    expect(beacon.room).toBe('sector:6:9');

    const p = beacon.payload as { shipId: string; shipName: string; fromSector: number; toSector: number };
    expect(p.shipId).toBe(MOVER);
    expect(p.shipName).toBe('Wanderer');
    const span = UNIVMAX * 2 + 1;
    expect({ x: (p.toSector % span) - UNIVMAX, y: Math.floor(p.toSector / span) - UNIVMAX }).toEqual({ x: 6, y: 9 });
    expect({ x: (p.fromSector % span) - UNIVMAX, y: Math.floor(p.fromSector / span) - UNIVMAX }).toEqual({ x: 5, y: 3 });
  });

  /**
   * An AI hull is an observer too (status AUTO is accepted), but an EMPTY SLOT
   * is not a pair of eyes. `findAllShips` returns slots as well as ships.
   *
   * Mutation that breaks it: widen the status test to `s.status !== undefined`
   * or drop it entirely.
   */
  it('does not count a ship slot that nobody is flying', () => {
    const h = build();
    withMover(h);
    h.addShip(ship({ userid: 'usr_empty', shipno: 1, xcoord: 6.4, ycoord: 9.4, status: GESTAT_AVAIL }));

    arrive(h);

    expect(beacons(h)).toHaveLength(0);
  });

  /**
   * The observer must be in the sector ENTERED. Comparing raw coordinates, or
   * comparing against `fromSector`, would let a ship one sector over trigger a
   * beacon in a room it cannot see.
   *
   * Mutation that breaks it: compare `s.xcoord === toSector.x` without the
   * floor, or test `fromSector` instead.
   */
  it('does not count a ship in the neighbouring sector', () => {
    const h = build();
    withMover(h);
    h.addShip(ship({ userid: 'usr_near', shipno: 1, xcoord: 7.0, ycoord: 9.5, status: GESTAT_USER }));

    arrive(h);

    expect(beacons(h)).toHaveLength(0);
  });

  /**
   * The 1-in-10 gate still stands behind the observer test: a random that does
   * not land on a multiple of ten stays silent even with a witness present.
   *
   * Mutation that breaks it: drop `gernd(this.random) % 10 !== 0`.
   */
  it('stays silent when the roll misses, witness or not', () => {
    // gernd = floor(0.5 * 65536) = 32768; 32768 % 10 === 8.
    const h = build({ next: () => 0.5 });
    withMover(h);
    h.addShip(ship({ userid: 'usr_watch', shipno: 1, xcoord: 6.1, ycoord: 9.9, status: GESTAT_USER }));

    arrive(h);

    expect(beacons(h)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('processBroadcasts — the room prefixes that are not Socket.io rooms', () => {
  const send = (h: Harness, broadcast: Record<string, unknown>, sender?: FakeSocket): void =>
    (h.gateway as unknown as {
      processBroadcasts: (r: unknown, c?: unknown) => void;
    }).processBroadcasts({ lines: [], broadcasts: [broadcast] }, sender as never);

  /**
   * `ship:<userid>:<shipno>` is not a room anything joins — it is a single
   * terminal, the way C writes with `outprfge(FILTER, shpnum)`. `sca sh` uses
   * it to tell ONE hull it has been scanned (GECMDS.C:2280). Widening it turns
   * a private "you are being scanned" warning into an announcement that tells
   * every other pilot in earshot that a scanner is active nearby.
   *
   * Mutation that breaks it: relax the predicate to `ship.userid === uid`, or
   * route the branch through `server.to(broadcast.room)` — nothing joins that
   * room, so the warning would vanish instead.
   */
  it('a ship: address reaches that hull and no other', () => {
    const h = build();
    h.addShip(ship({ userid: 'usr_scanned', shipno: 2 }));
    h.addShip(ship({ userid: 'usr_scanned', shipno: 1 }));
    h.addShip(ship({ userid: 'usr_other', shipno: 1 }));
    const wanted = h.addSocket('sock-wanted', 'usr_scanned', 2);
    const sameCaptainOtherHull = h.addSocket('sock-other-hull', 'usr_scanned', 1);
    const bystander = h.addSocket('sock-bystander', 'usr_other', 1);

    send(h, { room: 'ship:usr_scanned:2', event: 'scan.notice', payload: { by: 'Rick' } });

    expect(received(wanted, 'scan.notice')).toEqual([{ by: 'Rick' }]);
    expect(received(sameCaptainOtherHull, 'scan.notice')).toEqual([]);
    expect(received(bystander, 'scan.notice')).toEqual([]);
  });

  /**
   * An untuned `galaxy` broadcast is the unfiltered one — `outwar(...,ALWAYS)`
   * (GECMDS.C:1825). Narrowing it to sockets with a boarded hull would silence
   * the galaxy feed for anyone sitting in onboarding, who is exactly the
   * player most helped by seeing the world is alive.
   *
   * Mutation that breaks it: send this branch through `emitToSockets`, which
   * drops every socket with no active ship.
   */
  it('an untagged galaxy broadcast goes out unfiltered, payload intact', () => {
    const h = build();
    const onboarding: FakeSocket = { id: 'sock-new', data: {}, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
    h.sockets.set(onboarding.id, onboarding);

    send(h, { room: 'galaxy', event: 'message.send', payload: { text: 'all hands' } });

    expect(h.globalEmits).toEqual([{ event: 'message.send', payload: { text: 'all hands' } }]);
    expect(received(onboarding, 'message.send')).toEqual([]);
    expect(h.roomEmits).toHaveLength(0);
  });

  /**
   * A room's member set outlives the socket: Socket.io leaves an id behind for
   * a tick after a disconnect, and the adapter is read straight into the loop.
   * Without the guard the fan-out throws on the dead id and every member AFTER
   * it in the set loses the message — a tuned transmission silently delivered
   * to half a sector.
   *
   * Mutation that breaks it: delete `if (!sock) continue;` from emitToSockets.
   */
  it('a stale room member does not swallow the rest of a tuned transmission', () => {
    const h = build();
    h.addShip(ship({ userid: 'usr_a', shipno: 1, freq: [1234, 0, 0] }));
    h.addShip(ship({ userid: 'usr_b', shipno: 1, freq: [0, 1234, 0] }));
    const a = h.addSocket('sock-a', 'usr_a', 1);
    const b = h.addSocket('sock-b', 'usr_b', 1);
    // 'ghost' disconnected but is still listed by the adapter, and sits
    // BETWEEN the two live members so a throw would be visible on b alone.
    h.rooms.set('sector:5:3', new Set(['sock-a', 'ghost', 'sock-b']));

    send(h, { room: 'sector:5:3', event: 'message.send', payload: { text: 'tuned' }, freq: 1234 });

    expect(received(a, 'message.send')).toEqual([{ text: 'tuned' }]);
    expect(received(b, 'message.send')).toEqual([{ text: 'tuned' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('shield charge narration — the captain’s terminal, not the sector', () => {
  const charge = (h: Harness, kind: 'charging' | 'full', percent: number): void =>
    (h.gateway as unknown as { handleShipShieldCharge: (e: unknown) => void }).handleShipShieldCharge({
      shipId: 'usr_cap:4',
      kind,
      percent,
    });

  /**
   * `outprfge(FILTER,usrn)` (GEFUNCS.C:2515-2523) — one terminal. Shield state
   * is the fact that decides a fight: `shieldchg` puts back `shieldtype*3` a
   * tick, so knowing a neighbour is at 40% and climbing tells an attacker
   * exactly when to fire. Broadcasting this to the sector hands that away, and
   * also announces the presence of a ship running silent.
   *
   * Mutation that breaks it: address `sector:...`, or add the sector room
   * alongside the captain's.
   */
  it('addresses only the captain’s own room, and carries the percentage', () => {
    const h = build();
    charge(h, 'charging', 73);

    expect(h.roomEmits.map((e) => e.room)).toEqual(['user:usr_cap']);
    expect((h.roomEmits[0].payload as { text: string }).text).toContain('73');
  });

  /**
   * SHLDUP is the OTHER message, and carries no number — canon prints
   * "fully charged", not "at 100 percent". A captain who sees a percentage
   * here cannot tell a full bank from one still climbing.
   *
   * Mutation that breaks it: swap the arms of the `kind === 'full'` ternary,
   * or always format SHLDAT.
   */
  it('says the bank is full, without a percentage, at full charge', () => {
    const h = build();
    charge(h, 'full', 100);

    const text = (h.roomEmits[0].payload as { text: string }).text;
    expect(text).toMatch(/fully charged/i);
    expect(text).not.toContain('100');
  });
});
