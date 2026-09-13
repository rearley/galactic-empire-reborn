import type {
  EventLogLine,
  PhysicsSectorTransitionPayload,
  PlayerSectorPayload,
  SectorShipTransitPayload,
} from '@ge/wire';
import { ConnectedPlayer } from './connected-ships.registry';
import { PhysicsSectorTransitionEvent } from '../game/physics/physics-events';
import { shouldBroadcastTransition } from './transition-visibility';
import { moverVisibilityUpdates } from './player-visibility';
import { UNIVMAX } from '../game/constants';
import { BEACON_EVENT, BeaconEvent } from './events/beacon.event';

/** The fields of a moving ship this planner needs, looked up by `shipId`. */
export interface TransitionShipInfo {
  status: number;
  speed: number;
  shipname: string;
}

/** Resolves a ship key (`userid:shipno`) to the info above, or `undefined` if unknown. */
export type TransitionShipLookup = (shipId: string) => TransitionShipInfo | undefined;

/** An emit addressed to the mover's own socket only. */
export type MoverEmit =
  | { event: 'physics.sector-transition'; payload: PhysicsSectorTransitionPayload }
  | { event: 'player.sector'; payload: PlayerSectorPayload }
  | { event: 'event.log'; payload: EventLogLine };

/**
 * An emit addressed to a sector room. `exceptSelf: true` marks the two notices
 * C sends with the mover excluded — see `TransitionPlan` for how that combines
 * with room-membership timing to decide who actually receives each one.
 */
export type RoomEmit =
  | { room: string; event: 'player.sector'; payload: PlayerSectorPayload }
  | { room: string; event: 'sector:ship-left'; payload: SectorShipTransitPayload; exceptSelf: true }
  | { room: string; event: 'sector:ship-entered'; payload: SectorShipTransitPayload; exceptSelf: true }
  | { room: string; event: typeof BEACON_EVENT; payload: BeaconEvent };

/**
 * The two facts the beacon decision needs that a pure planner must not
 * compute itself: whether an observer sits in the destination sector — which
 * requires the full ship roster, AI hulls included, not just `roster` — and
 * the random draw. The caller already has `findAllShips()` and already owns
 * the RNG, so it computes both and hands them in; `planTransition` stays
 * deterministic. See the beacon block below for the citation and the exact
 * conditions these two fields stand in for.
 */
export interface BeaconRoll {
  hasObserver: boolean;
  roll: number;
}

/**
 * What `handleSectorTransition` should do about one `physics.sector-transition`
 * event, as data. `leave`/`join` are the mover's own socket room changes.
 *
 * THE FIELD ORDER BELOW IS THE EXECUTION ORDER, and every boundary between
 * two of these buckets is load-bearing. Two separate things depend on it:
 *
 * 1. WHO RECEIVES a room emit. Room membership at the MOMENT OF THE EMIT
 *    decides who a plain `.to(room).emit()` reaches, because neither the
 *    arrival nor the departure `player.sector` broadcast carries `.except()`.
 *    `roomEmitsBeforeMove` MUST be sent while the mover is still in the old
 *    room and not yet in the new one — that membership state is exactly what
 *    keeps the mover off the arrival broadcast (not yet joined) while leaving
 *    them a recipient of the departure one (not yet left).
 *    `roomEmitsAfterMove` MUST be sent once the mover has left/joined:
 *    `sector:ship-left`/`sector:ship-entered` use `.except()` so timing does
 *    not change who receives them, but the beacon does not — canon includes
 *    the mover in its own beacon because by the time C sends it the mover has
 *    already been added to the destination room.
 *
 * 2. WHAT THE MOVER ENDS UP BELIEVING. The mover emits are NOT
 *    order-independent of the room emits, even though no mover emit depends on
 *    room membership. The mover is still in `sector:from` when
 *    `roomEmitsBeforeMove` goes out, so it RECEIVES the departure broadcast
 *    `{ shipId, sector: null }` about itself. `moverEmitsAfterRoomEmits`
 *    carries the correcting `{ shipId, sector: toSector }` row and MUST follow
 *    it, because the client's player list is last-write-wins on `sector`
 *    (frontend/src/state/usePlayerList.ts). Send the mover emits first and the
 *    null wins: the player's own row in their own list blanks to an em dash
 *    after every crossing, and stays blank until the next `player.snapshot`.
 *
 * The full sequence, which must match the pre-split handler line for line:
 *   1. `moverEmitsBeforeRoomEmits`  — `physics.sector-transition`
 *   2. `roomEmitsBeforeMove`        — arrival to `sector:to`, departure to
 *                                     `sector:from` (the mover hears this one)
 *   3. `moverEmitsAfterRoomEmits`   — `player.sector`, repairing the above
 *   4. `leave` / `join`             — the mover's socket changes rooms
 *   5. `moverEmitsAfterMove`        — MOVE1 "You have moved…" `event.log`
 *   6. `roomEmitsAfterMove`         — MOVE2 / MOVE3 / beacon
 *
 * All fields are empty when the moving ship cannot be found, or when the
 * transition did not actually cross a sector boundary — both cases where the
 * original handler returns before doing anything at all.
 */
export interface TransitionPlan {
  leave: string[];
  join: string[];
  moverEmitsBeforeRoomEmits: MoverEmit[];
  roomEmitsBeforeMove: RoomEmit[];
  moverEmitsAfterRoomEmits: MoverEmit[];
  moverEmitsAfterMove: MoverEmit[];
  roomEmitsAfterMove: RoomEmit[];
}

const emptyPlan = (): TransitionPlan => ({
  leave: [],
  join: [],
  moverEmitsBeforeRoomEmits: [],
  roomEmitsBeforeMove: [],
  moverEmitsAfterRoomEmits: [],
  moverEmitsAfterMove: [],
  roomEmitsAfterMove: [],
});

/**
 * Plans the joins, leaves and emits for one sector-boundary crossing.
 *
 * MOVE2: "X has left the sector." → emitted to fromSector room
 * MOVE3: "X has entered the sector." → emitted to toSector room
 * Both only fire when speed < 21000 (not at high warp) — faithful to
 * GEFUNCS.C:714 which gates on `ptr->speed < 21000.0`.
 *
 * This event carries the mover's RAW x/y — finer than a sector — and used to
 * go to every connected client on every boundary crossing. That was a live
 * position feed for all 24 Cybertrons and every droid, and, once `who`
 * stopped publishing player sectors, for every player too.
 *
 * Its one consumer is the mover's own ScanMap, which clears when the local
 * ship changes sector (FR-013), so the mover is the whole audience. The
 * status gate stays as a second lock: an AI has no socket to send to, but
 * nothing should depend on that staying true.
 * @see transition-visibility.ts, player-visibility.ts
 *
 * @see GEFUNCS.C:709-723 moveship sector-change branch
 * @see GEFUNCS.C:711 MOVE1 prfmsg (the mover's own "you have moved" line)
 * @see GEFUNCS.C:716 `prfmsg(MOVE2,ptr->shipname);` — left sector, mover excluded
 * @see GEFUNCS.C:721 `prfmsg(MOVE3,ptr->shipname);` — entered sector, mover excluded
 */
export function planTransition(
  event: PhysicsSectorTransitionEvent,
  roster: ConnectedPlayer[],
  lookup: TransitionShipLookup,
  beacon?: BeaconRoll,
): TransitionPlan {
  const { shipId, fromSector, toSector } = event;
  const plan = emptyPlan();

  const ship = lookup(shipId);

  if (shouldBroadcastTransition(ship?.status)) {
    plan.moverEmitsBeforeRoomEmits.push({ event: 'physics.sector-transition', payload: event });
  }

  if (fromSector.x === toSector.x && fromSector.y === toSector.y) return plan;
  if (!ship) return plan;

  // Position is scoped to your own sector, so a crossing changes what three
  // audiences may see: the sector entered gains the mover, the sector left
  // loses them, and the mover's own view of everyone else flips both ways.
  // Nobody else's view changed, so nobody else is told. @see player-visibility.ts
  if (shouldBroadcastTransition(ship.status)) {
    plan.roomEmitsBeforeMove.push({
      room: `sector:${toSector.x}:${toSector.y}`,
      event: 'player.sector',
      payload: { updates: [{ shipId, sector: toSector }] },
    });
    plan.roomEmitsBeforeMove.push({
      room: `sector:${fromSector.x}:${fromSector.y}`,
      event: 'player.sector',
      payload: { updates: [{ shipId, sector: null }] },
    });

    // The mover's own row is included explicitly, and this emit MUST follow
    // the two room broadcasts above (see `TransitionPlan`): their socket does
    // not join `sector:to` until further down, so the arrival broadcast does
    // not reach them and their own position would go stale — and their socket
    // has not left `sector:from` either, so the departure broadcast's
    // `sector: null` about themselves DOES reach them and has to be repaired
    // by this row landing after it.
    const forMover = [
      { shipId, sector: toSector },
      ...moverVisibilityUpdates(roster, shipId, fromSector, toSector),
    ];
    plan.moverEmitsAfterRoomEmits.push({ event: 'player.sector', payload: { updates: forMover } });
  }

  // Move the player's socket to the new sector room so they receive sector-scoped events.
  plan.leave.push(`sector:${fromSector.x}:${fromSector.y}`);
  plan.join.push(`sector:${toSector.x}:${toSector.y}`);

  // Gate: no notices at high warp (speed >= 21000) — GEFUNCS.C:714
  const name = ship.shipname;

  // C tells the mover they moved, and tells the two sectors about them while
  // EXCLUDING the mover: `outsect(FILTER, &sect, usrn, 0)` (GEFUNCS.C:717,722).
  // Without the exclusion a pilot was told "<their own ship> has entered the
  // sector" on every boundary crossing, because their socket joins the
  // destination room just above; and without MOVE1 nothing told them they had
  // changed sector at all.
  //
  // MOVE1 is UNCONDITIONAL. Only the two sector broadcasts carry the
  // `ptr->speed < 21000.0` gate (GEFUNCS.C:714, :719); the mover's own line
  // sits above it at :711-713. The port returned early on the gate and
  // silenced all three, so a ship above warp 21 crossed boundaries with no
  // running account of where it was. Nothing surfaced it until a hull that
  // fast existed in play: the starting classes cap at warp 10 and it took a
  // Dreadnought at warp 50 to find.
  plan.moverEmitsAfterMove.push({
    event: 'event.log',
    payload: {
      category: 'nav',
      text: `You have moved from sector (${fromSector.x}, ${fromSector.y}) to (${toSector.x}, ${toSector.y}).`,
    },
  });

  // Gate: no SECTOR notices at high warp — you are through too fast to be
  // seen. @see GEFUNCS.C:714, :719
  if (ship.speed >= 21000) return plan;

  plan.roomEmitsAfterMove.push({
    room: `sector:${fromSector.x}:${fromSector.y}`,
    event: 'sector:ship-left',
    payload: { shipId, shipName: name },
    exceptSelf: true,
  });

  plan.roomEmitsAfterMove.push({
    room: `sector:${toSector.x}:${toSector.y}`,
    event: 'sector:ship-entered',
    payload: { shipId, shipName: name },
    exceptSelf: true,
  });

  // S-005: beacon-on-move (GEFUNCS.C:808-816). Re-emit BEACON_EVENT when:
  //   (a) at least one OBSERVER ship is in the destination sector
  //       (status === GESTAT_USER (1) or GESTAT_AUTO (2), excluding mover)
  //   (b) gernd()%10 === 0 (1-in-10 probability gate from C source)
  // Restores audit 020 F-005 which regressed in commit 481961e.
  //
  // `hasObserver` and `roll` are supplied by the caller (see `BeaconRoll`
  // above) — this planner stays deterministic and never touches the RNG.
  if (beacon?.hasObserver && beacon.roll % 10 === 0) {
    plan.roomEmitsAfterMove.push({
      room: `sector:${toSector.x}:${toSector.y}`,
      event: BEACON_EVENT,
      payload: {
        shipId,
        shipName: name,
        // Flat sector id, offset so the -UNIVMAX..+UNIVMAX square maps to 0..n.
        fromSector: (fromSector.y + UNIVMAX) * (UNIVMAX * 2 + 1) + (fromSector.x + UNIVMAX),
        toSector: (toSector.y + UNIVMAX) * (UNIVMAX * 2 + 1) + (toSector.x + UNIVMAX),
      },
    });
  }

  return plan;
}
