import { planTransition, TransitionShipLookup } from '../../src/gateway/sector-transition';
import { ConnectedPlayer } from '../../src/gateway/connected-ships.registry';
import { PhysicsSectorTransitionEvent } from '../../src/game/physics/physics-events';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * `planTransition` is the pure planner behind `GameGateway.handleSectorTransition`
 * (game.gateway.ts). It turns one `physics.sector-transition` event into a
 * `TransitionPlan` — room joins, room leaves, and emits — without touching a
 * socket, so the visibility asymmetry (everyone learns a NAME, only the
 * arriving sector learns a POSITION) is testable without one.
 * @see src/gateway/sector-transition.ts for the full C-source derivation.
 */
describe('planTransition', () => {
  const event = (overrides: Partial<PhysicsSectorTransitionEvent> = {}): PhysicsSectorTransitionEvent => ({
    shipId: 'u1:1',
    fromSector: { x: 4, y: 3 },
    toSector: { x: 5, y: 3 },
    x: 5.02,
    y: 3.5,
    tickAt: new Date(0),
    ...overrides,
  });

  const ship: TransitionShipLookup = () => ({ status: 1, speed: 100, shipname: 'Wanderer' });

  it('leaves the old sector room and joins the new one', () => {
    const plan = planTransition(event(), [], ship);
    expect(plan.leave).toEqual(['sector:4:3']);
    expect(plan.join).toEqual(['sector:5:3']);
  });

  it('orders the mover\u2019s repairing player.sector AFTER the room broadcast that nulls them', () => {
    // The mover is still in `sector:from` when `roomEmitsBeforeMove` goes out,
    // so it hears the `{ sector: null }` departure row about itself. The
    // repairing row lives in `moverEmitsAfterRoomEmits` for exactly that
    // reason. Pinned here at the plan level; the executed-order proof is the
    // ordered-timeline suite at the bottom of this file.
    const plan = planTransition(event(), [], ship);
    const departure = plan.roomEmitsBeforeMove.find((e) => e.room === 'sector:4:3');
    expect(departure).toMatchObject({ event: 'player.sector', payload: { updates: [{ shipId: 'u1:1', sector: null }] } });
    expect(plan.moverEmitsAfterRoomEmits.some((e) => e.event === 'player.sector')).toBe(true);
  });

  it('gives the mover a roster scoped to the sector they arrived in, not the one they left', () => {
    // The mover must never hold a position they may not show — filtering in the
    // UI leaks straight back out through devtools. @see gateway/player-visibility.ts
    const roster: ConnectedPlayer[] = [
      { shipId: 'left:1', name: 'LeftBehind', sector: { x: 4, y: 3 }, shipClass: 1 },
      { shipId: 'here:1', name: 'Neighbour', sector: { x: 5, y: 3 }, shipClass: 1 },
    ];
    const plan = planTransition(event(), roster, ship);

    const moverUpdate = plan.moverEmitsAfterRoomEmits.find((e) => e.event === 'player.sector');
    expect(moverUpdate).toBeDefined();
    const updates = (moverUpdate as { payload: { updates: unknown[] } }).payload.updates;
    expect(updates).toContainEqual({ shipId: 'here:1', sector: { x: 5, y: 3 } });
    expect(updates).toContainEqual({ shipId: 'left:1', sector: null });
    expect(updates).toContainEqual({ shipId: 'u1:1', sector: { x: 5, y: 3 } });
  });

  it('produces no plan at all when the ship cannot be found', () => {
    const plan = planTransition(event(), [], () => undefined);
    expect(plan).toEqual({
      leave: [],
      join: [],
      moverEmitsBeforeRoomEmits: [],
      roomEmitsBeforeMove: [],
      moverEmitsAfterRoomEmits: [],
      moverEmitsAfterMove: [],
      roomEmitsAfterMove: [],
    });
  });

  it('joins/leaves and sends no sector notices when the sector does not change, but still tells the mover their own physics update', () => {
    // physics.sector-transition is emitted before the same-sector check runs —
    // MOVE1's gate is independent of the sector-change branch.
    const plan = planTransition(event({ toSector: { x: 4, y: 3 } }), [], ship);
    expect(plan.leave).toEqual([]);
    expect(plan.join).toEqual([]);
    expect(plan.roomEmitsBeforeMove).toEqual([]);
    expect(plan.roomEmitsAfterMove).toEqual([]);
    expect(plan.moverEmitsBeforeRoomEmits).toEqual([
      { event: 'physics.sector-transition', payload: event({ toSector: { x: 4, y: 3 } }) },
    ]);
    expect(plan.moverEmitsAfterRoomEmits).toEqual([]);
    expect(plan.moverEmitsAfterMove).toEqual([]);
  });

  it('excludes the mover from the sector arrival/departure notices', () => {
    const plan = planTransition(event(), [], ship);
    const left = plan.roomEmitsAfterMove.find((e) => e.event === 'sector:ship-left');
    const entered = plan.roomEmitsAfterMove.find((e) => e.event === 'sector:ship-entered');
    expect(left).toMatchObject({ room: 'sector:4:3', exceptSelf: true, payload: { shipId: 'u1:1', shipName: 'Wanderer' } });
    expect(entered).toMatchObject({ room: 'sector:5:3', exceptSelf: true, payload: { shipId: 'u1:1', shipName: 'Wanderer' } });
  });

  it('above warp 21,000 still joins/leaves and tells the mover, but sends no sector notices', () => {
    const fast: TransitionShipLookup = () => ({ status: 1, speed: 21_000, shipname: 'Wanderer' });
    const plan = planTransition(event(), [], fast);
    expect(plan.leave).toEqual(['sector:4:3']);
    expect(plan.join).toEqual(['sector:5:3']);
    expect(plan.moverEmitsAfterMove.some((e) => e.event === 'event.log')).toBe(true);
    expect(plan.roomEmitsAfterMove.filter((e) => e.event.startsWith('sector:ship-'))).toHaveLength(0);
  });

  it('does not broadcast a GESTAT_AUTO ship’s position — an AI has no socket, but nothing depends on that', () => {
    const auto: TransitionShipLookup = () => ({ status: 2, speed: 100, shipname: 'Drone' });
    const plan = planTransition(event(), [], auto);
    expect(plan.moverEmitsBeforeRoomEmits.some((e) => e.event === 'physics.sector-transition')).toBe(false);
    expect(plan.moverEmitsAfterRoomEmits.some((e) => e.event === 'player.sector')).toBe(false);
    expect(plan.roomEmitsBeforeMove.some((e) => e.event === 'player.sector')).toBe(false);
    // Join/leave and the ship-left/entered notices are unconditional on this gate.
    expect(plan.join).toEqual(['sector:5:3']);
  });

  describe('the beacon re-broadcast (S-005)', () => {
    it('is absent when the caller supplies no beacon roll', () => {
      const plan = planTransition(event(), [], ship);
      expect(plan.roomEmitsAfterMove.some((e) => e.event === 'beacon')).toBe(false);
    });

    it('is absent when there is no observer, even on a winning roll', () => {
      const plan = planTransition(event(), [], ship, { hasObserver: false, roll: 20 });
      expect(plan.roomEmitsAfterMove.some((e) => e.event === 'beacon')).toBe(false);
    });

    it('is absent on a losing roll, even with an observer present', () => {
      const plan = planTransition(event(), [], ship, { hasObserver: true, roll: 21 });
      expect(plan.roomEmitsAfterMove.some((e) => e.event === 'beacon')).toBe(false);
    });

    it('fires to the destination sector, unexcepted, on an observer + a winning (1-in-10) roll', () => {
      const plan = planTransition(event(), [], ship, { hasObserver: true, roll: 20 });
      const beacon = plan.roomEmitsAfterMove.find((e) => e.event === 'beacon');
      expect(beacon).toMatchObject({ room: 'sector:5:3', payload: { shipId: 'u1:1', shipName: 'Wanderer' } });
      expect(beacon).not.toHaveProperty('exceptSelf');
    });
  });
});

/**
 * FINDING 1 / 1b (2026-09-11 quality review, round 1): the original handler
 * fired the un-excepted `player.sector` arrival/departure broadcasts BEFORE
 * moving the mover's socket between rooms. A first cut of the extraction
 * fired them AFTER — nothing leaked to an unauthorised client (both notices
 * carry only what `player-visibility.ts` already allows), but the MOVER
 * itself would have received a redundant arrival notice (already joined
 * `sector:to`) and lost the departure notice (already left `sector:from`).
 *
 * Every other spec in this file, and the pre-existing guard specs, fake
 * `to()`/`except()` as bare recorders with no room-membership model, so this
 * ordering bug is invisible to all of them — a socket that was never
 * "in" a room can't be excluded from something it also can't be a member of.
 * This suite models real Socket.io room membership (join/leave mutate a
 * room -> socket-ids map; `to(room).emit()` snapshots that map's contents AT
 * THE MOMENT OF THE EMIT) specifically to close that hole.
 */
describe('GameGateway — sector transition respects real room membership', () => {
  interface RecordedEmit {
    room: string;
    event: string;
    recipients: string[];
  }

  /**
   * ONE ordered log for BOTH delivery channels. Recording room emits into
   * `emits[]` while mover-socket emits went to a separate `vi.fn()` is what
   * let the C-1 regression through: the two channels were never compared for
   * order, so nothing noticed that the mover's repairing `player.sector` had
   * moved in FRONT of the departure broadcast that nulls it.
   */
  interface TimelineEntry {
    channel: 'mover' | 'room';
    room?: string;
    event: string;
    payload: unknown;
    /** Room emits only: who the emit actually reached at the moment it fired. */
    recipients?: string[];
  }

  const build = () => {
    const rooms = new Map<string, Set<string>>();
    const sockets = new Map<string, { id: string; emit: Mock; join: Mock; leave: Mock }>();
    const emits: RecordedEmit[] = [];
    const timeline: TimelineEntry[] = [];

    const addToRoom = (socketId: string, room: string) => {
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(socketId);
    };

    const makeSocket = (id: string, startRoom: string) => {
      const sock = {
        id,
        connected: true,
        data: {} as Record<string, unknown>,
        emit: vi.fn((event: string, payload: unknown) => {
          if (id === 'sock-mover') timeline.push({ channel: 'mover', event, payload });
        }),
        join: vi.fn((room: string) => addToRoom(id, room)),
        leave: vi.fn((room: string) => rooms.get(room)?.delete(id)),
        disconnect: vi.fn(),
        broadcast: { emit: vi.fn() },
      };
      sockets.set(id, sock);
      addToRoom(id, startRoom);
      return sock;
    };

    const moverSocket = makeSocket('sock-mover', 'sector:4:3');
    const bystanderInOldSector = makeSocket('sock-bystander-old', 'sector:4:3');
    const bystanderInNewSector = makeSocket('sock-bystander-new', 'sector:5:3');

    const mover = { userid: 'u1', shipno: 1, shipname: 'Wanderer', speed: 100, status: 1, xcoord: 5.02, ycoord: 3.5 };
    const shipStateService = {
      findAllShips: () => [mover],
      findByUserid: () => [mover],
      get: vi.fn().mockReturnValue(mover),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    vi.spyOn(registry, 'getSocketId').mockReturnValue(moverSocket.id);

    const gateway = makeGateway({
      shipStateService,
      registry,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });

    const recordRoom = (room: string, event: string, payload: unknown, recipients: string[]) => {
      emits.push({ room, event, recipients });
      timeline.push({ channel: 'room', room, event, payload, recipients });
    };

    const roomEmitter = (room: string) => ({
      emit: (event: string, payload?: unknown) => {
        recordRoom(room, event, payload, [...(rooms.get(room) ?? [])]);
      },
      except: (exceptId: string) => ({
        emit: (event: string, payload?: unknown) => {
          recordRoom(room, event, payload, [...(rooms.get(room) ?? [])].filter((id) => id !== exceptId));
        },
      }),
    });

    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: (room: string) => roomEmitter(room),
      sockets: { sockets, adapter: { rooms } },
    };

    return { gateway, moverSocket, bystanderInOldSector, bystanderInNewSector, emits, timeline };
  };

  const fire = (gateway: GameGateway) =>
    gateway.handleSectorTransition({
      shipId: 'u1:1',
      fromSector: { x: 4, y: 3 },
      toSector: { x: 5, y: 3 },
      x: 5.02,
      y: 3.5,
    } as never);

  it('does not deliver the arrival broadcast to the mover — they have not joined yet when it fires', () => {
    const { gateway, moverSocket, emits } = build();
    fire(gateway);

    const arrival = emits.find((e) => e.room === 'sector:5:3' && e.event === 'player.sector');
    expect(arrival).toBeDefined();
    expect(arrival!.recipients).not.toContain(moverSocket.id);
  });

  it('still delivers the arrival broadcast to a bystander already in the destination sector', () => {
    const { gateway, bystanderInNewSector, emits } = build();
    fire(gateway);

    const arrival = emits.find((e) => e.room === 'sector:5:3' && e.event === 'player.sector');
    expect(arrival!.recipients).toContain(bystanderInNewSector.id);
  });

  it('delivers the departure broadcast to the mover — they have not left yet when it fires', () => {
    const { gateway, moverSocket, emits } = build();
    fire(gateway);

    const departure = emits.find((e) => e.room === 'sector:4:3' && e.event === 'player.sector');
    expect(departure).toBeDefined();
    expect(departure!.recipients).toContain(moverSocket.id);
  });

  it('still delivers the departure broadcast to a bystander left behind in the old sector', () => {
    const { gateway, bystanderInOldSector, emits } = build();
    fire(gateway);

    const departure = emits.find((e) => e.room === 'sector:4:3' && e.event === 'player.sector');
    expect(departure!.recipients).toContain(bystanderInOldSector.id);
  });

  it('excludes the mover from sector:ship-entered/left regardless of room-membership timing', () => {
    const { gateway, moverSocket, emits } = build();
    fire(gateway);

    const entered = emits.find((e) => e.room === 'sector:5:3' && e.event === 'sector:ship-entered');
    const left = emits.find((e) => e.room === 'sector:4:3' && e.event === 'sector:ship-left');
    expect(entered!.recipients).not.toContain(moverSocket.id);
    expect(left!.recipients).not.toContain(moverSocket.id);
  });

  /**
   * C-1 (2026-09-11 whole-branch review). Recipient sets alone cannot catch
   * this: every assertion above still passes with the mover emits hoisted in
   * front of the room emits. What changes is the ORDER the mover's client sees
   * them in, and `usePlayerList`'s SECTOR case is last-write-wins on `sector`
   * (frontend/src/state/usePlayerList.ts:50-56), so whichever `player.sector`
   * row about the mover lands LAST is what the mover believes.
   */
  describe('what the mover ends up believing about its own sector', () => {
    /** Every `player.sector` the mover's client actually receives, in order. */
    const moverInbox = (timeline: ReturnType<typeof build>['timeline'], moverId: string) =>
      timeline.filter(
        (e) =>
          e.event === 'player.sector' &&
          (e.channel === 'mover' || (e.recipients ?? []).includes(moverId)),
      );

    /** `usePlayerList`'s SECTOR reducer, last-write-wins, replayed over that inbox. */
    const believedSector = (inbox: TimelineEntry[], shipId: string): unknown => {
      let sector: unknown = 'never-told';
      for (const entry of inbox) {
        const { updates } = entry.payload as { updates: { shipId: string; sector: unknown }[] };
        for (const u of updates) if (u.shipId === shipId) sector = u.sector;
      }
      return sector;
    };

    it('ends at toSector, not null — the repair must land after the departure broadcast', () => {
      const { gateway, moverSocket, timeline } = build();
      fire(gateway);

      const inbox = moverInbox(timeline, moverSocket.id);
      // Both halves must be present, or the assertion below passes vacuously.
      expect(inbox.some((e) => e.channel === 'room' && e.room === 'sector:4:3')).toBe(true);
      expect(inbox.some((e) => e.channel === 'mover')).toBe(true);

      expect(believedSector(inbox, 'u1:1')).toEqual({ x: 5, y: 3 });
    });

    it('puts the whole sequence in the pre-split order, mover and room channels interleaved', () => {
      const { gateway, timeline } = build();
      fire(gateway);

      expect(timeline.map((e) => `${e.channel}:${e.room ?? '-'}:${e.event}`)).toEqual([
        'mover:-:physics.sector-transition',
        'room:sector:5:3:player.sector',
        'room:sector:4:3:player.sector',
        'mover:-:player.sector',
        'mover:-:event.log',
        'room:sector:4:3:sector:ship-left',
        'room:sector:5:3:sector:ship-entered',
      ]);
    });
  });
});

/**
 * FINDING (round 2, 2026-09-11 quality review): `gernd()` must be called ONLY
 * when an observer is present in the destination sector — the original
 * guarded the DRAW itself with `if (!hasObserver) return;` before ever
 * calling `gernd()`. A prior fix computed `hasObserver` but called `gernd()`
 * unconditionally, using `hasObserver` only to decide whether the RESULT was
 * used. `gernd()` advances a PRNG stream shared with combat and spawning, so
 * an extra draw on every crossing into an empty sector silently shifts every
 * later roll in the game — a real gameplay change invisible to every test
 * above, none of which assert on draw COUNT (they only assert on emitted
 * events, using a `mockRandom` that never records calls).
 */
describe('GameGateway — the beacon roll only draws from the PRNG when there is something to roll for', () => {
  const build = (observerInDestination: boolean) => {
    const moverSocket = {
      id: 'sock-mover', connected: true,
      data: {} as Record<string, unknown>,
      emit: vi.fn(), on: vi.fn(), join: vi.fn(), leave: vi.fn(),
      disconnect: vi.fn(), broadcast: { emit: vi.fn() },
    };

    const mover = { userid: 'u1', shipno: 1, shipname: 'Wanderer', speed: 100, status: 1, xcoord: 5.02, ycoord: 3.5 };
    const observer = { userid: 'obs', shipno: 1, shipname: 'Observer', speed: 0, status: 1, xcoord: 5.5, ycoord: 3.5 };
    const ships = observerInDestination ? [mover, observer] : [mover];

    const shipStateService = {
      findAllShips: () => ships,
      findByUserid: () => ships,
      get: vi.fn().mockReturnValue(mover),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    vi.spyOn(registry, 'getSocketId').mockReturnValue(moverSocket.id);

    const next = vi.fn().mockReturnValue(0);
    const gateway = makeGateway({
      shipStateService,
      registry,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: { next },
    });

    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: () => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) }),
      sockets: { sockets: new Map([[moverSocket.id, moverSocket]]), adapter: { rooms: new Map() } },
    };

    return { gateway, next };
  };

  const fire = (gateway: GameGateway) =>
    gateway.handleSectorTransition({
      shipId: 'u1:1',
      fromSector: { x: 4, y: 3 },
      toSector: { x: 5, y: 3 },
      x: 5.02,
      y: 3.5,
    } as never);

  it('does not draw when no observer is present in the destination sector', () => {
    const { gateway, next } = build(false);
    fire(gateway);
    expect(next).not.toHaveBeenCalled();
  });

  it('draws exactly once when an observer is present', () => {
    const { gateway, next } = build(true);
    fire(gateway);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
