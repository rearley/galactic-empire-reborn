/**
 * Typed event names + payload contracts emitted by `PhysicsTickService` on
 * `EventEmitter2`. Listeners run synchronously on the tick thread; long-running
 * consumers MUST defer their work (e.g., `setImmediate`).
 *
 * @see specs/006a-physics-tick/contracts/physics-events.md
 */

export const PHYSICS_SECTOR_TRANSITION = 'physics.sector-transition' as const;
export const PHYSICS_BOUNDARY_WRAPPED = 'physics.boundary-wrapped' as const;
export const PHYSICS_HYPERSPACE = 'physics.hyperspace' as const;

/**
 * Emitted whenever a ship's coordinate update crosses a sector boundary
 * (`floor(preX) !== floor(postX)` OR `floor(preY) !== floor(postY)`).
 * Sector is derived from coordinates — there is no stored sector field.
 */
export interface PhysicsSectorTransitionEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** Pre-update derived sector (floor of pre-update coords). */
  fromSector: { x: number; y: number };
  /** Post-update derived sector (floor of post-update coords). */
  toSector: { x: number; y: number };
  /** Post-update coordinates (source of truth). */
  x: number;
  y: number;
  /** TickContext.firedAt. */
  tickAt: Date;
}

/**
 * Emitted when a ship's coordinate is wrapped at the universe boundary.
 * Internal event only — not routed to clients.
 *
 * @see GEFUNCS.C:651-705 moveship — univwrap branch
 */
export interface PhysicsBoundaryWrappedEvent {
  shipId: string;
  axis: 'x' | 'y' | 'both';
  preCoord: { x: number; y: number };
  postCoord: { x: number; y: number };
  tickAt: number;
}

/**
 * Emitted on the tick where the acceleration step crosses the warp threshold
 * (`speed === 1000`) in either direction. Mirrors `hyperspace(ptr, usrn, 1|0)`.
 *
 * @see GEFUNCS.C:483, 539 — hyperspace() call sites
 */
export interface PhysicsHyperspaceEvent {
  /** Composite key — `${userid}:${shipno}`. */
  shipId: string;
  /** 'enter' = crossing 999 → ≥1000; 'exit' = crossing ≥1000 → <1000. */
  direction: 'enter' | 'exit';
  /** Post-step speed. */
  speed: number;
  /** TickContext.firedAt. */
  tickAt: Date;
}
