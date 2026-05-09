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
  sector: Sector;
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
