export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Violation {
  rule: string;
  sourceRef: string;
  severity: Severity;
  detail: string;
}

/**
 * Snapshot the tick service passes to registered invariants. All fields are
 * optional and typed as `unknown` — invariants must defensively narrow what
 * they consume so they tolerate a partially-populated snapshot (Task 8 wires
 * the runtime populators incrementally).
 */
export interface WorldSnapshot {
  /** Active in-memory ships (ShipStateService.getAllActive()). */
  ships?: unknown;
  /** AI controllers (cybertron/droid) — reserved for future invariants. */
  ai?: unknown;
  /** Recent player/AI weapon-fire events (CombatTickService ring buffer). */
  combatEvents?: unknown;
  /** Recent AI fire events with shooter scanRange at fire time. */
  aiFireEvents?: unknown;
  /** Recent scan results (scanner type + revealed cells). */
  scanResults?: unknown;
  /** DB ship rows keyed by shipId — populated when INVARIANTS_DB_CHECK=1. */
  dbShips?: unknown;
}

export interface Invariant {
  name: string;
  sourceRef: string;
  run: (world: WorldSnapshot) => Violation[];
}
