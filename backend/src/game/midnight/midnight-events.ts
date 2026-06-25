/**
 * Typed event names for midnight.* events emitted via EventEmitter2.
 * Follows the same convention as combat-events.ts and cybertron-events.ts.
 *
 * @see src/game/midnight/midnight.service.ts run() — emits MIDNIGHT_COMPLETED
 * @see src/game/ship/ship-state.service.ts refreshTeamcodes() — listens via @OnEvent
 */

/** Fired by MidnightService.run() after a successful transaction commit + recordRun. */
export const MIDNIGHT_COMPLETED = 'midnight.completed' as const;

/** Payload for the MIDNIGHT_COMPLETED event. */
export interface MidnightCompletedPayload {
  /** ISO date string (YYYY-MM-DD) of the run date. */
  runDate: string;
  /** Duration of the full midnight pass in milliseconds. */
  durationMs: number;
}
