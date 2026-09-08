/**
 * A colony hailing a ship that is loitering in its sector.
 *
 * Routed to the one captain, not the sector room: canon rolls per SHIP
 * (GEFUNCS.C:809-813 runs inside the per-user movement path), so two pilots
 * sitting in the same sector hear the beacon on different ticks. Broadcasting
 * it to the room would make a colony shout at everyone in unison, which is a
 * different and worse thing.
 */

export const PLANET_BEACON = 'planet.beacon' as const;

export interface PlanetBeaconEvent {
  /** `${userid}:${shipno}` — routed to that captain alone. */
  shipId: string;
  /** The planet slot number, as canon prints it. */
  plnum: number;
  /** The colony's message, already validated as printable. */
  message: string;
}
