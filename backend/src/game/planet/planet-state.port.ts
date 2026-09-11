import type { PlanetState } from './planet-state.types';

/**
 * What the ship subsystem needs from in-memory planet state, and nothing more.
 *
 * Exactly the one lookup `MaintenanceService` and `ShipTickService` call —
 * the former to price a repair, the latter to find the ion cannons a hostile
 * ship is flying past. Narrowing the seam is what lets `ShipModule` import
 * `PlanetModule` outright instead of through a `forwardRef`.
 */
export interface PlanetStatePort {
  /** The planet at (xsect, ysect, plnum), or undefined if there is none. */
  get(xsect: number, ysect: number, plnum: number): PlanetState | undefined;
}

/** Injection token for {@link PlanetStatePort}. Bound in `PlanetModule`. */
export const PLANET_STATE_PORT = Symbol('PLANET_STATE_PORT');
