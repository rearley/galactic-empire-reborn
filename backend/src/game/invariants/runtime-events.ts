/**
 * Shared event-shape types and a tiny bounded ring-buffer for runtime
 * invariant snapshot population (Task 8).
 *
 * The shapes here match the narrowing helpers in:
 *   - combat-ranges.invariants.ts  (isCombatEvent)
 *   - ai-targeting.invariants.ts   (isAiFireEvent)
 *
 * Each producer (CombatTickService, PhaserHandlerService, CybertronTickService,
 * DroidTickService) keeps its own bounded ring buffer; the ring stays at ≤
 * `MAX_EVENTS` regardless of whether INVARIANTS_RUNTIME=1. That way the data
 * is fresh the moment the flag flips on without ever growing unbounded.
 */

/** Maximum entries any one ring buffer keeps. */
export const MAX_EVENTS = 50;

export interface CombatEventForInvariants {
  weapon: string;
  shooter: { x: number; y: number };
  target: { x: number; y: number };
  /** Max effective range for this weapon at fire time. */
  maxRange: number;
}

export interface AiFireEventForInvariants {
  shipClass: string;
  shooter: { x: number; y: number };
  target: { x: number; y: number };
  /** Scanner range in raw coord units (cdistance × 10_000). */
  scanRange: number;
  /** `cdistance(shooter, target) * 10_000` at fire time. */
  distanceRaw: number;
}

/** Push to a bounded buffer; keeps the most recent `MAX_EVENTS`. */
export function pushBounded<T>(buf: T[], item: T): void {
  buf.push(item);
  if (buf.length > MAX_EVENTS) buf.shift();
}
