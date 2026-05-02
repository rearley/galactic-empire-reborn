/**
 * The three heartbeat cadences driven by TickService.
 * @see GEMAIN.H TICKTIME=6 (PHYSICS), TICKTIME2=1 (SHIP_UPDATE)
 * @see GEMAIN.C main loop
 * @see GEMAIN.C:656 plantime = plantock / numrecs (PLANET_UPDATE)
 */
export enum TickKind {
  SHIP_UPDATE = 'SHIP_UPDATE',
  PHYSICS = 'PHYSICS',
  PLANET_UPDATE = 'PLANET_UPDATE',
}

/**
 * Passed to every registered handler on each tick firing.
 * @see GEMAIN.C main loop
 */
export interface TickContext {
  kind: TickKind;
  tickNumber: number;
  firedAt: Date;
}

/**
 * A handler that reacts to a tick. May return a promise; the result is not awaited
 * by the dispatcher (fire-and-forget with .catch for isolation — FR-011, FR-012).
 */
export type TickHandler = (ctx: TickContext) => void | Promise<void>;

/** Calling the returned function removes the handler and is idempotent. */
export type Unsubscribe = () => void;
