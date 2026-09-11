import type { ShipState } from './ship-state.types';

/**
 * What the planet subsystem needs from in-memory ship state, and nothing more.
 *
 * Exactly the three methods `PlanetStateService` and `PlanetAttackService`
 * call. Narrowing the seam is what lets `PlanetModule` depend on the leaf
 * `ShipStateModule` instead of the whole of `ShipModule`, which is what
 * retired the ship <-> planet `forwardRef` cycle.
 */
export interface ShipStatePort {
  /** The active ship for a (userid, shipno), or undefined if not loaded. */
  get(userid: string, shipno: number): ShipState | undefined;

  /** Apply a mutation in place and mark the ship dirty for the next flush. */
  mutate(
    userid: string,
    shipno: number,
    fn: (state: ShipState) => void,
  ): ShipState | undefined;

  /** Every loaded ship belonging to a captain, ascending by shipno. */
  findByUserid(userid: string): ShipState[];
}

/** Injection token for {@link ShipStatePort}. Bound in `ShipStateModule`. */
export const SHIP_STATE_PORT = Symbol('SHIP_STATE_PORT');
