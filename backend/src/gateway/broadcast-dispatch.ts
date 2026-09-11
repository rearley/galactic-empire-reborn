import type { CommandBroadcast } from '../game/commands/command.types';
import type { ShipState } from '../game/ship/ship-state.types';
import type { BroadcastTarget, GameServer } from './game.gateway';

/** Socket ids currently in `room`, or an empty set when the room is gone. */
export function roomMembers(server: GameServer, room: string): Set<string> {
  return server.sockets.adapter.rooms.get(room) ?? new Set<string>();
}

/**
 * Emits `broadcast` on `target`, narrowing `broadcast.event` so
 * `broadcast.payload` is checked against the ONE wire payload type that
 * event actually carries, rather than passing a union `event` and an
 * unrelated `payload` to a single `.emit()` call (which the typed
 * `Server`/`Socket` generics correctly refuse — `event` and `payload` are
 * a discriminated union on `CommandBroadcast`, and Socket.io's overloaded
 * `emit` cannot verify that correlation across a union without this
 * per-branch narrowing).
 *
 * `'player.snapshot'` never reaches here — `processBroadcasts` resolves it
 * to `emitScopedSnapshotToAll()` before any target-based dispatch. The case
 * exists only so this switch is exhaustive over `CommandBroadcast['event']`.
 */
export function dispatchBroadcast(target: BroadcastTarget, broadcast: CommandBroadcast): void {
  switch (broadcast.event) {
    case 'command.notice':
      target.emit('command.notice', broadcast.payload);
      return;
    case 'event.log':
      target.emit('event.log', broadcast.payload);
      return;
    case 'message.send':
      target.emit('message.send', broadcast.payload);
      return;
    case 'ship.renamed':
      target.emit('ship.renamed', broadcast.payload);
      return;
    case 'player.snapshot':
      return;
    default: {
      // Exhaustiveness check, not dead code: if `CommandBroadcast` ever
      // grows a sixth `event` variant, every case above still compiles —
      // `broadcast.event` would just be a value the switch does not
      // recognise, and the broadcast would silently vanish at runtime
      // exactly like the pre-fix probe test this switch replaced. Assigning
      // the unhandled remainder to `never` makes that a compile error
      // instead: TypeScript can only narrow `broadcast` to `never` here if
      // every union member was already matched above.
      const _exhaustive: never = broadcast;
      return _exhaustive;
    }
  }
}

/**
 * Emits `broadcast` to every socket whose active ship satisfies `accept`.
 *
 * `members` limits the sweep to one room's socket ids; omit it to consider
 * every connected socket. `excludeId` drops the sender, which C does by
 * passing `usrnum` to outsect/outwar.
 */
export function emitToSockets(
  server: GameServer,
  broadcast: CommandBroadcast,
  members: Set<string> | undefined,
  excludeId: string | undefined,
  accept: (ship: ShipState) => boolean,
  lookup: (userid: string, shipno: number) => ShipState | undefined,
): void {
  const ids = members ?? server.sockets.sockets.keys();
  for (const socketId of ids) {
    if (socketId === excludeId) continue;
    const sock = server.sockets.sockets.get(socketId);
    if (!sock) continue;
    const uid = sock.data.userid as string | undefined;
    const shipno = sock.data.activeShipNo as number | undefined;
    if (uid == null || shipno == null) continue;
    const ship = lookup(uid, shipno);
    if (!ship || !accept(ship)) continue;
    dispatchBroadcast(sock, broadcast);
  }
}
