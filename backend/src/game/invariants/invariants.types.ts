export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Violation {
  rule: string;
  sourceRef: string;
  severity: Severity;
  detail: string;
}

export interface WorldSnapshot {
  ships?: unknown;
  ai?: unknown;
  combatEvents?: unknown;
  scanResults?: unknown;
  dbShips?: unknown;
}

export interface Invariant {
  name: string;
  sourceRef: string;
  run: (world: WorldSnapshot) => Violation[];
}
