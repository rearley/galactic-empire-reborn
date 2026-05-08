/**
 * Beacon event emitted by the server to the toSector Socket.io room
 * when a ship transitions sectors and the C-source gating conditions hold.
 *
 * Gating: fromSector !== toSector, at least one observer in toSector,
 * and gernd() % 10 === 0 (1-in-10 probability from C source).
 *
 * @see GEFUNCS.C:808-816 — beacon-on-move logic
 * @see specs/020-source-fidelity-audit/contracts/beacon-event.md
 */
export const BEACON_EVENT = 'beacon' as const;

export interface BeaconEvent {
  shipId: string;
  shipName: string;
  fromSector: number;
  toSector: number;
}
