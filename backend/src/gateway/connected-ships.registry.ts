import { Injectable } from '@nestjs/common';
import { ShipStateService } from '../game/ship/ship-state.service';
import { shipKey } from '../game/ship/ship-state.types';

export interface Sector {
  x: number;
  y: number;
}

export interface ConnectedPlayer {
  shipId: string;
  name: string;
  /**
   * Where the ship is, or `null` when the recipient may not be told.
   * `list()` always fills it in; `scopePlayers()` is what blanks it per
   * viewer, immediately before the payload goes on the wire.
   * @see gateway/player-visibility.ts
   */
  sector: Sector | null;
  shipClass: number;
}

/**
 * Tracks which socket ID corresponds to each connected ship.
 * Enforces the single-socket-per-ship invariant: `upsert` returns the prior
 * socketId so the caller can disconnect it before registering the new one.
 *
 * @see specs/010-react-frontend/data-model.md §C.1
 * @see research.md R4 last-write-wins single-socket enforcement
 */
@Injectable()
export class ConnectedShipsRegistry {
  private readonly byShipId = new Map<string, string>(); // shipId → socketId
  private readonly bySocketId = new Map<string, string>(); // socketId → shipId

  constructor(private readonly shipStateService: ShipStateService) {}

  /**
   * Register or update the socketId for a shipId.
   * Returns the prior socketId if one existed (caller should disconnect it).
   */
  upsert(shipId: string, socketId: string): string | undefined {
    const prior = this.byShipId.get(shipId);

    // Re-registering the SAME socket is not a second session. The caller reads
    // a returned id as "someone displaced this player" and disconnects it — so
    // returning an unchanged id made a player displace themselves. `x` with a
    // single hull did exactly that: unboard, auto-reboard, self-evict, dead
    // window reading "Another session opened with your credentials".
    if (prior === socketId) return undefined;

    // This socket may already be flying a DIFFERENT hull, and `byShipId` is
    // keyed the other way round, so nothing above touches that entry. Without
    // this the map accumulates: a switch from A to B leaves `{A->S, B->S}`
    // while `bySocketId` correctly holds `{S->B}`.
    //
    // `list()` iterates `byShipId`, and `emitScopedSnapshotToAll` fans that out
    // to everyone — so the old hull stayed on every OTHER player's roster while
    // the switching player, whose own view comes from `bySocketId`, saw nothing
    // wrong. It looked self-healing only because `list()` skips a ship
    // `shipStateService` cannot resolve, so the ghost outlived the switch by
    // however long the old hull happened to stay in memory. @see issue #49
    //
    // Keyed on the SOCKET, not the userid: a captain may legitimately have a
    // second hull registered from a second socket, and evicting by owner would
    // unregister a session that is still flying.
    const priorShipForSocket = this.bySocketId.get(socketId);
    if (priorShipForSocket !== undefined && priorShipForSocket !== shipId) {
      this.byShipId.delete(priorShipForSocket);
    }

    if (prior !== undefined) {
      this.bySocketId.delete(prior);
    }
    this.byShipId.set(shipId, socketId);
    this.bySocketId.set(socketId, shipId);
    return prior;
  }

  /**
   * Remove the registration for a socket.
   * Returns the associated shipId if the socket was registered.
   */
  remove(socketId: string): { shipId: string } | undefined {
    const shipId = this.bySocketId.get(socketId);
    if (shipId === undefined) return undefined;
    this.bySocketId.delete(socketId);
    this.byShipId.delete(shipId);
    return { shipId };
  }

  /**
   * Returns true if the given socketId is registered as a bound player.
   * Onboarding sockets are not registered and return false.
   */
  isBound(socketId: string): boolean {
    return this.bySocketId.has(socketId);
  }

  getSocketId(shipId: string): string | undefined {
    return this.byShipId.get(shipId);
  }

  /**
   * Returns current data for all connected ships.
   * Ships missing from the in-memory store (race condition) are skipped.
   */
  list(): ConnectedPlayer[] {
    const result: ConnectedPlayer[] = [];
    for (const [sid] of this.byShipId.entries()) {
      const parts = sid.split(':');
      const shipno = Number(parts[parts.length - 1]);
      const userid = parts.slice(0, -1).join(':');
      const ship = this.shipStateService.get(userid, shipno);
      if (!ship) continue;
      result.push({
        shipId: shipKey(userid, shipno),
        name: ship.shipname,
        sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
        shipClass: ship.shpclass,
      });
    }
    return result;
  }
}
