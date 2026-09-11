/**
 * Naming a ship and its captain, the way canon's `username()` does.
 *
 * Both lookups were private methods on `GameGateway`. They moved here when the
 * death path became its own service, because both callers need them: the
 * gateway still names a phaser shot and a hit, and `ShipDestroyedService`
 * names the victim and the killer. A shared module keeps ONE copy of each
 * rather than a duplicate that can drift.
 */
import { ShipStateService } from '../game/ship/ship-state.service';

/**
 * The ship name behind a `userid:shipno` key, or undefined if it has left.
 *
 * Guarded: this only decorates a combat notice, and a thrown lookup inside
 * an @OnEvent handler would drop the broadcast for everyone in the sector.
 * A missing name costs a nicer label; a thrown one costs the whole event.
 */
export function shipNameOf(ships: ShipStateService, shipKey: string): string | undefined {
  try {
    const parts = shipKey.split(':');
    const shipno = Number(parts[parts.length - 1]);
    if (!Number.isFinite(shipno)) return undefined;
    return ships.get(parts.slice(0, -1).join(':'), shipno)?.shipname;
  } catch {
    return undefined;
  }
}

/**
 * A player's display handle, or null. Canon's `username()` names a player by
 * their handle and an AI by its hull; ours caches the handle on ShipState.
 * @see GEFUNCS.C:2596, src/game/ship/display-name.ts
 */
export function handleOf(ships: ShipStateService, shipKeyStr: string | null): string | null {
  if (!shipKeyStr) return null;
  const idx = shipKeyStr.lastIndexOf(':');
  if (idx < 0) return null;
  const ship = ships.get(shipKeyStr.slice(0, idx), Number(shipKeyStr.slice(idx + 1)));
  return ship?.username ?? null;
}
