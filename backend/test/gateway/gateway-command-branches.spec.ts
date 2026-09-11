import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  OnboardingService,
  SpawnSectorMissingError,
} from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import {
  COMBAT_HIT,
  CombatHitEvent,
  CombatShipDestroyedEvent,
} from '../../src/game/combat/combat-events';
import { ShipOverspeedEvent } from '../../src/game/ship/overspeed-events';

/**
 * Round 3 — the command-dispatch surface of GameGateway: which branch answers a
 * typed reply, and WHO the answer reaches.
 *
 * Every case here is a decision whose wrong answer costs the player something
 * concrete: a ship they cannot board, a second session flying their hull, a
 * name prompt they can never satisfy, or a combat notice delivered twice (or to
 * the wrong socket). Serialization itself is covered by
 * `command-serialization.spec.ts`, the followup redispatch by
 * `command-followup.spec.ts`, the ship-select menu by
 * `test/integration/onboarding/ship-select.spec.ts`, and the happy-path
 * onboarding joins by `onboarding-room-join.spec.ts` — none of that is repeated.
 *
 * Deliberately NOT covered here, with reasons (see docs/TEST_STRATEGY.md):
 *   - `shipLossManifest`'s `Number.isFinite(shipno)` guard
 *     (ship-destroyed.service.ts) and `shipNameOf`'s copy of it, and
 *     `handleOf`'s `idx < 0` guard (both ship-identity.ts).
 *     Both arms of each converge on the same observable output — with the guard
 *     removed the lookup is simply a miss and returns undefined/null anyway — so
 *     no assertion can distinguish them. A test that cannot fail is not a test.
 *   - `handleCombatHit`'s outer `if (victimSocketId)` (game.gateway.ts) for the
 *     same reason: with the guard gone the socket lookup misses and nothing is
 *     emitted. The INNER guard is the one that changes behaviour, and it is
 *     covered.
 */

type ShipRow = {
  userid: string;
  shipno: number;
  shipname: string;
  shpclass: number;
  xcoord: number;
  ycoord: number;
};

interface SocketDouble {
  id: string;
  connected: boolean;
  data: Record<string, unknown>;
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  on: jest.Mock;
  disconnect: jest.Mock;
  broadcast: {
    emit: jest.Mock;
    to: (room: string) => { emit: jest.Mock };
    except: (room: string | string[]) => { emit: jest.Mock };
  };
}

const USERID = 'usr_pilot';

function makeSocket(id: string, data: Record<string, unknown>): SocketDouble {
  const roomEmit = jest.fn();
  return {
    id,
    connected: true,
    data,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
    broadcast: {
      emit: jest.fn(),
      to: () => ({ emit: roomEmit }),
      except: () => ({ emit: roomEmit }),
    },
  };
}

/** Every payload a socket was handed, in order. */
function emitted(sock: SocketDouble): Array<{ event: string; payload: unknown }> {
  return sock.emit.mock.calls.map((c) => ({
    event: c[0] as string,
    payload: c[1] as unknown,
  }));
}

function eventsOf(sock: SocketDouble): string[] {
  return emitted(sock).map((e) => e.event);
}

describe('GameGateway — prompt replies: which branch answers, and with what', () => {
  interface Harness {
    gateway: GameGateway;
    registry: ConnectedShipsRegistry;
    finalize: jest.Mock;
    validateNameReply: jest.Mock;
    findFirst: jest.Mock;
    globalEmits: Array<{ event: string; payload: unknown }>;
    sockets: Map<string, SocketDouble>;
  }

  function build(opts: { validName?: boolean } = {}): Harness {
    const globalEmits: Array<{ event: string; payload: unknown }> = [];
    const sockets = new Map<string, SocketDouble>();

    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: jest.fn().mockReturnValue(undefined),
      removeFromGame: jest.fn(),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);

    const finalize = jest.fn();
    const validateNameReply = jest.fn().mockReturnValue(opts.validName ?? true);
    const onboardingService = {
      finalize,
      validateNameReply,
    } as unknown as OnboardingService;

    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      ship: { findFirst, findMany: jest.fn().mockResolvedValue([]) },
      planet: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const gateway = makeGateway({
      shipStateService,
      registry,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      prisma,
      onboardingService,
      scanHandler: { clearScantab: jest.fn(), lettersFor: () => [] } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: jest.fn().mockReturnValue('Interceptor') } as unknown as ShipClassCacheService,
      random: mockRandom,
    });

    (gateway as unknown as { server: unknown }).server = {
      emit: (event: string, payload: unknown) => {
        globalEmits.push({ event, payload });
      },
      to: () => ({ emit: jest.fn(), except: () => ({ emit: jest.fn() }) }),
      except: () => ({ emit: jest.fn() }),
      sockets: { sockets, adapter: { rooms: new Map<string, Set<string>>() } },
    };

    return { gateway, registry, finalize, validateNameReply, findFirst, globalEmits, sockets };
  }

  const onboardingSocket = (id = 'sock-new'): SocketDouble =>
    makeSocket(id, {
      userid: USERID,
      username: 'rick',
      onboarding: { step: 'AWAITING_NAME' as const },
    });

  const createdShip = (over: Partial<ShipRow> = {}) => ({
    shipno: 1,
    shipname: 'Wanderer',
    shpclass: 1,
    xcoord: 0.5,
    ycoord: 0.25,
    username: 'rick',
    fkeys: [],
    ...over,
  });

  // ── The gate in front of both prompt branches ────────────────────────────

  /**
   * `if (pendingShipSelect && userid)` — game.gateway.ts:1036.
   *
   * The ship-select branch queries `ship.findFirst({ where: { userid, shipno } })`.
   * An unauthenticated socket carries no userid, and `where: { userid: undefined }`
   * is not "no rows" in Prisma — it is "any row", which would board the caller
   * onto whatever hull matched the index. The userid half of that condition is
   * the only thing stopping it.
   *
   * MUTATION: drop `&& userid` → findFirst is called and the socket gets a
   * ship-select reply instead of NOT_IN_ONBOARDING.
   */
  it('will not run the ship-select branch for a socket with no authenticated user', async () => {
    const h = build();
    const sock = makeSocket('sock-anon', {
      pendingShipSelect: [
        { index: 1, shipno: 3, shpclass: 1, shipname: 'Freighter', xcoord: 2, ycoord: 2 },
      ],
    });

    await h.gateway.handlePromptReply(sock as never, { value: 1 });

    expect(h.findFirst).not.toHaveBeenCalled();
    expect(emitted(sock)).toEqual([
      { event: 'error', payload: { code: 'NOT_IN_ONBOARDING', message: 'Not in onboarding.' } },
    ]);
    expect(sock.data['activeShipNo']).toBeUndefined();
  });

  /**
   * `if (!onboarding || !userid)` — :1046.
   * MUTATION: remove the guard → finalize() runs for a socket that never asked
   * for a ship, creating a hull (and spending the starter grant) unprompted.
   */
  it('rejects a reply from a socket that is in neither prompt', async () => {
    const h = build();
    const sock = makeSocket('sock-idle', { userid: USERID });

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(h.finalize).not.toHaveBeenCalled();
    expect(eventsOf(sock)).toEqual(['error']);
  });

  // ── The name reply: :1052 (the value coercion) and :1053 (the validity gate) ──

  /**
   * `typeof body.value === 'string' ? body.value.trim() : ''` — :1052.
   *
   * The value is unknown off the wire. Coercing a non-string would let a client
   * name a hull `42`, `[object Object]` or `true` — permanent, since the name is
   * the identifier `sca sh`, `loc` and the ship-select menu all key on.
   *
   * MUTATION: `String(body.value)` instead of `''` → 42 validates and finalize
   * is called with '42'.
   */
  it('treats a non-string reply as empty rather than coercing it into a ship name', async () => {
    // validName:false because that is what the REAL validator does with '' —
    // `isValidShipName` requires 1-19 characters. The default harness mock
    // accepts everything, which would let this case assert that finalize was
    // skipped for a reason the production code does not actually have.
    const h = build({ validName: false });
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: 42 });

    expect(h.validateNameReply).toHaveBeenCalledWith('');
    expect(h.finalize).not.toHaveBeenCalled();
  });

  /**
   * The `.trim()` in the same expression. A name arriving with the newline or
   * spaces a terminal client leaves on it must be stored trimmed — canon's
   * names are 1-19 printable characters and `'  Wanderer  '` is neither the
   * same string nor a name anyone can type back at the game.
   *
   * MUTATION: drop `.trim()` → finalize receives '  Wanderer  '.
   */
  it('trims the reply before it becomes the hull name', async () => {
    const h = build();
    h.finalize.mockResolvedValue(createdShip());
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: '  Wanderer  ' });

    expect(h.validateNameReply).toHaveBeenCalledWith('Wanderer');
    expect(h.finalize).toHaveBeenCalledWith(USERID, 'Wanderer');
  });

  /**
   * `if (!this.onboardingService.validateNameReply(name))` — :1053.
   * MUTATION: drop the `!` (or the whole guard) → an invalid name reaches
   * finalize, and the pilot is never re-prompted.
   */
  it('re-prompts on a rejected name and creates nothing', async () => {
    const h = build({ validName: false });
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: '' });

    expect(h.finalize).not.toHaveBeenCalled();
    expect(emitted(sock)).toEqual([
      {
        event: 'prompt:ship-name',
        payload: { step: 'NAME', rule: '1-19 printable ASCII', error: 'invalid-format' },
      },
    ]);
    // Still in onboarding, so the next reply is still a name — not a command.
    expect(sock.data['onboarding']).toEqual({ step: 'AWAITING_NAME' });
    expect(sock.data['activeShipNo']).toBeUndefined();
  });

  // ── :1067 — a second session on the same hull ────────────────────────────

  /**
   * `if (priorSocketId)` — :1067. `upsert` returns the socket that held this
   * ship, and latest-wins means the old one must be told and hung up. Two live
   * sockets on one hull is two command queues driving the same ship: the loser
   * flies a ship it no longer owns and its orders interleave with the winner's.
   *
   * MUTATION: remove the body of the if → the displaced socket stays connected
   * and no `player.left` goes out, so the roster keeps the stale entry too.
   */
  it('hangs up the session that was already flying this hull', async () => {
    const h = build();
    const old = makeSocket('sock-old', { userid: USERID, activeShipNo: 1 });
    h.sockets.set('sock-old', old);
    h.registry.upsert(`${USERID}:1`, 'sock-old');

    h.finalize.mockResolvedValue(createdShip());
    const sock = onboardingSocket('sock-new');

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(old.disconnect).toHaveBeenCalledWith(true);
    expect(h.globalEmits).toContainEqual({
      event: 'player.left',
      payload: { shipId: `${USERID}:1` },
    });
    // The winner owns the hull.
    expect(h.registry.getSocketId(`${USERID}:1`)).toBe('sock-new');
    expect(sock.data['activeShipNo']).toBe(1);
  });

  /**
   * The false arm of the same branch. A first-ever pilot displaces nobody, and
   * announcing `player.left` for a ship that just arrived would delete the new
   * arrival from every other client's roster on sight.
   *
   * MUTATION: make the emit unconditional → `player.left` appears for a ship
   * nobody has left.
   */
  it('announces no departure when nobody was displaced', async () => {
    const h = build();
    h.finalize.mockResolvedValue(createdShip());
    const sock = onboardingSocket('sock-new');

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(h.globalEmits.filter((e) => e.event === 'player.left')).toEqual([]);
    expect(h.registry.getSocketId(`${USERID}:1`)).toBe('sock-new');
  });

  // ── :1127 / :1132 / :1138 / :1141 — how finalize fails ───────────────────

  /**
   * `if (err instanceof SpawnSectorMissingError)` — :1127. A missing spawn
   * sector is an operator fault, not the pilot's: it must be named, because the
   * generic INTERNAL branch invites the player to keep retrying a name that was
   * never the problem.
   *
   * MUTATION: remove the branch → code 'INTERNAL' with 'Failed to create ship.'
   */
  it('names a missing spawn sector instead of blaming the name', async () => {
    const h = build();
    h.finalize.mockRejectedValue(new SpawnSectorMissingError(0, 0));
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(emitted(sock)).toEqual([
      {
        event: 'error',
        payload: { code: 'SPAWN_MISSING', message: 'Spawn sector (0,0) not found in galaxy' },
      },
    ]);
    expect(sock.data['activeShipNo']).toBeUndefined();
    expect(sock.data['onboarding']).toEqual({ step: 'AWAITING_NAME' });
  });

  /**
   * P2002 on the ship NAME — :1132-1134 true, :1138 false. The pilot picked a
   * name someone already holds; the only useful answer is the prompt again,
   * tagged `name-taken`, with onboarding still open.
   *
   * MUTATION: drop the P2002 test → 'INTERNAL', and the client (which re-prompts
   * only on `prompt:ship-name`) leaves the pilot at a dead prompt forever.
   */
  it('re-prompts with name-taken when the hull name collides', async () => {
    const h = build();
    h.finalize.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['shipname'] },
      }),
    );
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(emitted(sock)).toEqual([
      {
        event: 'prompt:ship-name',
        payload: { step: 'NAME', rule: '1-19 printable ASCII', error: 'name-taken' },
      },
    ]);
    expect(sock.data['onboarding']).toEqual({ step: 'AWAITING_NAME' });
  });

  /**
   * P2002 on the USERID — :1138 true, :1141 true. Two finalize calls raced (two
   * tabs, or a double-submit) and the other one won: this account already owns a
   * hull. Re-prompting for a name here would ask a pilot who HAS a ship to
   * invent another one, and the ship they own would sit unboarded — the socket
   * would answer 'No active ship.' to everything.
   *
   * MUTATION: flip the `target.includes('userid')` test → the name-taken prompt,
   * with `activeShipNo` never set.
   */
  it('boards the hull that won the race instead of asking for another name', async () => {
    const h = build();
    h.finalize.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: 'Ship_userid_key' },
      }),
    );
    h.findFirst.mockResolvedValue({
      userid: USERID,
      shipno: 4,
      shipname: 'Wanderer',
      shpclass: 1,
      xcoord: 12.75,
      ycoord: -3.25,
    } as ShipRow);
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(sock.data['activeShipNo']).toBe(4);
    expect(sock.data['onboarding']).toBeUndefined();
    expect(h.registry.getSocketId(`${USERID}:4`)).toBe('sock-new');
    // Rooms, or the pilot hears nothing from their own sector. Math.floor(-3.25)
    // is -4: the sector below the axis, not the one above it.
    expect(sock.join).toHaveBeenCalledWith(`user:${USERID}`);
    expect(sock.join).toHaveBeenCalledWith('sector:12:-4');
    expect(eventsOf(sock)).toContain('command:result');
    expect(eventsOf(sock)).not.toContain('prompt:ship-name');
  });

  /**
   * :1141 false — the race path, but the winning hull is already gone (destroyed
   * between the constraint failure and the lookup). CHARACTERIZATION: the code
   * returns silently. What matters for the player is that the socket is not left
   * half-boarded — an `activeShipNo` pointing at a row that does not exist is
   * the state every command reads before it fails.
   *
   * MUTATION: remove the `if (ship)` guard → `ship.shipno` throws, and the throw
   * escapes handlePromptReply (it is inside the catch block, so nothing catches
   * it) — the socket gets no answer at all and the promise rejects.
   */
  it('leaves the socket unboarded, not half-boarded, when the raced hull is gone', async () => {
    const h = build();
    h.finalize.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['userid'] },
      }),
    );
    h.findFirst.mockResolvedValue(null);
    const sock = onboardingSocket();

    await expect(h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' })).resolves.toBeUndefined();

    expect(sock.data['activeShipNo']).toBeUndefined();
    expect(eventsOf(sock)).toEqual([]);
  });

  /**
   * The else of :1132 — anything that is not a Prisma unique violation.
   * MUTATION: treat every error as P2002 → a database outage is reported to the
   * pilot as "that name is taken", and they retype names at a dead server.
   */
  it('reports an unexpected failure as INTERNAL, not as a taken name', async () => {
    const h = build();
    h.finalize.mockRejectedValue(new Error('connection reset'));
    const sock = onboardingSocket();

    await h.gateway.handlePromptReply(sock as never, { value: 'Wanderer' });

    expect(emitted(sock)).toEqual([
      { event: 'error', payload: { code: 'INTERNAL', message: 'Failed to create ship.' } },
    ]);
  });
});

describe('GameGateway — a hit reaches its victim exactly once', () => {
  /**
   * `if (victimSocket && !victimSocket.rooms.has(room))` — game.gateway.ts:1389.
   *
   * COMBAT_HIT goes to the sector room; the victim may be OUTSIDE it, because a
   * hyper-phaser reaches across a sector boundary. The direct emit covers that
   * case and must not double-deliver to a victim who is standing in the room.
   * Canon prints PHITYOU exactly once per hit (GECMDS.C:989-990); twice reads as
   * taking twice the fire you took, which is a decision to disengage.
   */
  interface HitHarness {
    gateway: GameGateway;
    registry: ConnectedShipsRegistry;
    roomEmits: Array<{ room: string; event: string; payload: unknown }>;
    sockets: Map<string, SocketDouble>;
  }

  function build(): HitHarness {
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
    const sockets = new Map<string, SocketDouble>();

    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: (userid: string, shipno: number) => {
        if (userid === 'usr_att' && shipno === 1) {
          return { userid, shipno, shipname: 'Marauder' } as never;
        }
        if (userid === 'usr_vic' && shipno === 2) {
          return { userid, shipno, shipname: 'Defiant' } as never;
        }
        return undefined;
      },
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);

    const gateway = makeGateway({
      shipStateService,
      registry,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: jest.fn(), lettersFor: () => [] } as unknown as ScanHandlerService,
      random: mockRandom,
    });

    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          roomEmits.push({ room, event, payload });
        },
        except: () => ({ emit: jest.fn() }),
      }),
      except: () => ({ emit: jest.fn() }),
      sockets: { sockets, adapter: { rooms: new Map<string, Set<string>>() } },
    };

    return { gateway, registry, roomEmits, sockets };
  }

  const hit = (): CombatHitEvent => ({
    attackerId: 'usr_att:1',
    victimId: 'usr_vic:2',
    weapon: 'phaser',
    damageHull: 9,
    damageShield: 0,
    sector: { x: 6, y: 9 },
    tickAt: new Date(),
  });

  /** A victim socket that is (or is not) in the sector room the hit is broadcast to. */
  function seatVictim(h: HitHarness, rooms: string[]): SocketDouble & { rooms: Set<string> } {
    const sock = Object.assign(makeSocket('sock-vic', { userid: 'usr_vic', activeShipNo: 2 }), {
      rooms: new Set(rooms),
    });
    h.sockets.set('sock-vic', sock);
    h.registry.upsert('usr_vic:2', 'sock-vic');
    return sock;
  }

  /**
   * MUTATION: drop `!victimSocket.rooms.has(room)` → the victim's own socket
   * gets a second COMBAT_HIT on top of the sector broadcast it already sees.
   */
  it('does not repeat the hit directly when the victim is in the sector room', () => {
    const h = build();
    const sock = seatVictim(h, ['sector:6:9', 'user:usr_vic']);

    h.gateway.handleCombatHit(hit());

    expect(h.roomEmits.filter((e) => e.room === 'sector:6:9' && e.event === COMBAT_HIT)).toHaveLength(1);
    expect(eventsOf(sock)).not.toContain(COMBAT_HIT);
  });

  /**
   * The other arm: a cross-sector hit (hyper-phaser range) where the sector
   * broadcast cannot reach the victim at all.
   *
   * MUTATION: replace the condition with `false` → the victim outside the room
   * is never told they were hit, and loses a hull to fire they never saw.
   */
  it('delivers the hit directly to a victim standing outside the broadcast room', () => {
    const h = build();
    const sock = seatVictim(h, ['sector:7:9', 'user:usr_vic']);

    h.gateway.handleCombatHit(hit());

    const direct = emitted(sock).filter((e) => e.event === COMBAT_HIT);
    expect(direct).toHaveLength(1);
    // The enriched payload, not the raw event: the client resolves AI names from
    // this and nowhere else.
    expect(direct[0].payload).toMatchObject({
      attackerId: 'usr_att:1',
      attackerName: 'Marauder',
      victimId: 'usr_vic:2',
      victimName: 'Defiant',
      damageHull: 9,
    });
  });
});

describe('GameGateway — routing a per-captain notice', () => {
  interface NoticeHarness {
    gateway: GameGateway;
    roomEmits: Array<{ room: string; event: string; payload: unknown }>;
  }

  function build(): NoticeHarness {
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: jest.fn(), lettersFor: () => [] } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          roomEmits.push({ room, event, payload });
        },
        except: () => ({ emit: jest.fn() }),
      }),
      except: () => ({ emit: jest.fn() }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map<string, Set<string>>() } },
    };
    return { gateway, roomEmits };
  }

  const overspeed = (kind: 'warn' | 'break', text: string): ShipOverspeedEvent => ({
    shipId: 'usr_pilot:2',
    kind,
    text,
  });

  /**
   * `event.kind === 'break' ? ...` — game.gateway.ts:1482, and the `user:` room
   * it goes to. Canon prints the ladder and WARPBRK to the pilot's own channel
   * (`prfmsg` + the captain's usrn, GEFUNCS.C:748-765) — never the sector, which
   * would tell an enemy your drive just blew.
   *
   * CHARACTERIZATION for the `**` banner (canon's text carries its own emphasis;
   * ours marks the break line). The ROOM is not characterization: it is the
   * decision that keeps the failure private.
   *
   * MUTATION: drop the ternary → the break reads exactly like the fourth warning
   * a pilot has already learned to ignore. Change the room to `sector:` → the
   * pilot's engine failure is announced to whoever is hunting them.
   */
  it('marks the drive failure and sends it to that captain alone', () => {
    const { gateway, roomEmits } = build();

    gateway.handleShipOverspeed(overspeed('break', 'Your warp drive has blown.'));

    expect(roomEmits).toEqual([
      {
        room: 'user:usr_pilot',
        event: 'event.log',
        payload: { category: 'combat', text: '** Your warp drive has blown. **' },
      },
    ]);
  });

  /** The other arm — a warning is passed through unmarked. */
  it('leaves a warning unmarked', () => {
    const { gateway, roomEmits } = build();

    gateway.handleShipOverspeed(overspeed('warn', 'Your engines are straining.'));

    expect(roomEmits).toEqual([
      {
        room: 'user:usr_pilot',
        event: 'event.log',
        payload: { category: 'combat', text: 'Your engines are straining.' },
      },
    ]);
  });

});

describe('GameGateway — KILLEDBY names the killer by their handle', () => {
  /**
   * `handleOf` — ship-identity.ts, called by `ShipDestroyedService.handle` for
   * the KILLEDBY label. Canon's `username()` names a player by their HANDLE
   * (GEFUNCS.C:2596);
   * ours caches it on ShipState. Without the lookup the galaxy-wide kill notice
   * reads "destroyed by usr_27523ed6401c4e990dd98be2" — the internal account key
   * `username()` exists to hide, and the name nobody can act on.
   */
  const kill = (over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent => ({
    victimId: 'usr_vic:2',
    attackerId: 'usr_kil:1',
    victimShipKey: 'usr_vic:2',
    attackerShipKey: 'usr_kil:1',
    victimUserid: 'usr_vic',
    attackerUserid: 'usr_kil',
    attackerName: 'Marauder',
    attackerChannel: 7,
    weapon: 'phaser',
    sector: { x: 6, y: 9 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 500,
    ...over,
  } as CombatShipDestroyedEvent);

  /** Fires the handler and returns every galaxy-wide event.log line. */
  function fire(event: CombatShipDestroyedEvent): string[] {
    const lines: string[] = [];
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      removeFromGame: jest.fn(),
      get: (userid: string, shipno: number) => {
        if (userid === 'usr_kil' && shipno === 1) {
          return { userid, shipno, shipname: 'Marauder', username: 'rick', status: 1 } as never;
        }
        if (userid === 'usr_vic' && shipno === 2) {
          return { userid, shipno, shipname: 'Defiant', username: 'jo', status: 1 } as never;
        }
        return undefined;
      },
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
      prisma: {
        $transaction: jest.fn().mockResolvedValue(undefined),
        planet: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      scanHandler: { clearScantab: jest.fn(), lettersFor: () => [] } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    const record = (evt: string, payload: unknown): void => {
      if (evt === 'event.log') lines.push((payload as { text: string }).text);
    };
    (gateway as unknown as { server: unknown }).server = {
      emit: record,
      except: () => ({ emit: record }),
      to: () => ({ emit: jest.fn() }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map<string, Set<string>>() } },
    };
    void gateway.handleCombatShipDestroyed(event);
    return lines;
  }

  /**
   * MUTATION: make `handleOf` return null (or drop the `?? null` fallback chain's
   * first term) → the kill is announced as "destroyed by usr_kil!!!", the raw
   * account key. Every existing KILLEDBY case uses ships with no `username`, so
   * this is the only test that pins the handle lookup itself.
   */
  it('uses the killer\'s handle, not their account key', () => {
    expect(fire(kill()).join('\n')).toContain('destroyed by rick!!!');
  });

  /**
   * `if (!shipKeyStr) return null` — :1492. The kill may carry a userid with no
   * ship key at all; `null.lastIndexOf` would throw INSIDE the destruction
   * handler, taking the hull delete, the loot and the announcement with it.
   *
   * MUTATION: remove the guard → TypeError, and the kill is lost.
   */
  it('survives a kill credited to a userid with no ship key', () => {
    const lines = fire(kill({ attackerShipKey: null, attackerName: null }));
    expect(lines.join('\n')).toContain('destroyed by usr_kil!!!');
  });
});
