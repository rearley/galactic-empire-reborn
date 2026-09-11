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
 * C sends with the mover excluded — without it the mover's own socket, having
 * already joined the destination room, would be told about its own arrival.
 */
export type RoomEmit =
  | { room: string; event: 'player.sector'; payload: PlayerSectorPayload }
  | { room: string; event: 'sector:ship-left'; payload: SectorShipTransitPayload; exceptSelf: true }
  | { room: string; event: 'sector:ship-entered'; payload: SectorShipTransitPayload; exceptSelf: true };

/**
 * What `handleSectorTransition` should do about one `physics.sector-transition`
 * event, as data. `leave`/`join` are the mover's own socket room changes, in
 * order; `moverEmits` go to the mover's socket alone; `roomEmits` go to a
 * sector room (see `RoomEmit.exceptSelf`).
 *
 * All four are empty when the moving ship cannot be found, or when the
 * transition did not actually cross a sector boundary — both cases where the
 * original handler returns before doing anything at all.
 */
export interface TransitionPlan {
  leave: string[];
  join: string[];
  moverEmits: MoverEmit[];
  roomEmits: RoomEmit[];
}

const emptyPlan = (): TransitionPlan => ({ leave: [], join: [], moverEmits: [], roomEmits: [] });

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
 * @see GEFUNCS.C:716 MOVE2 prfmsg (left sector, mover excluded)
 * @see GEFUNCS.C:721 MOVE3 prfmsg (entered sector, mover excluded)
 */
export function planTransition(
  event: PhysicsSectorTransitionEvent,
  roster: ConnectedPlayer[],
  lookup: TransitionShipLookup,
): TransitionPlan {
  const { shipId, fromSector, toSector } = event;
  const plan = emptyPlan();

  const ship = lookup(shipId);

  if (shouldBroadcastTransition(ship?.status)) {
    plan.moverEmits.push({ event: 'physics.sector-transition', payload: event });
  }

  if (fromSector.x === toSector.x && fromSector.y === toSector.y) return plan;
  if (!ship) return plan;

  // Position is scoped to your own sector, so a crossing changes what three
  // audiences may see: the sector entered gains the mover, the sector left
  // loses them, and the mover's own view of everyone else flips both ways.
  // Nobody else's view changed, so nobody else is told. @see player-visibility.ts
  if (shouldBroadcastTransition(ship.status)) {
    plan.roomEmits.push({
      room: `sector:${toSector.x}:${toSector.y}`,
      event: 'player.sector',
      payload: { updates: [{ shipId, sector: toSector }] },
    });
    plan.roomEmits.push({
      room: `sector:${fromSector.x}:${fromSector.y}`,
      event: 'player.sector',
      payload: { updates: [{ shipId, sector: null }] },
    });

    // The mover's own row is included explicitly: their socket does not join
    // `sector:to` until further down this method, so the arrival broadcast
    // above does not reach them and their own position would go stale.
    const forMover = [
      { shipId, sector: toSector },
      ...moverVisibilityUpdates(roster, shipId, fromSector, toSector),
    ];
    plan.moverEmits.push({ event: 'player.sector', payload: { updates: forMover } });
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
  plan.moverEmits.push({
    event: 'event.log',
    payload: {
      category: 'nav',
      text: `You have moved from sector (${fromSector.x}, ${fromSector.y}) to (${toSector.x}, ${toSector.y}).`,
    },
  });

  // Gate: no SECTOR notices at high warp — you are through too fast to be
  // seen. @see GEFUNCS.C:714, :719
  if (ship.speed >= 21000) return plan;

  plan.roomEmits.push({
    room: `sector:${fromSector.x}:${fromSector.y}`,
    event: 'sector:ship-left',
    payload: { shipId, shipName: name },
    exceptSelf: true,
  });

  plan.roomEmits.push({
    room: `sector:${toSector.x}:${toSector.y}`,
    event: 'sector:ship-entered',
    payload: { shipId, shipName: name },
    exceptSelf: true,
  });

  return plan;
}
