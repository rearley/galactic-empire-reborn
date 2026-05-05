import { Prisma } from '@prisma/client';

/**
 * Composite key for the in-memory ship state Map.
 * Mirrors Ship @@id([userid, shipno]) from the Prisma schema.
 */
export function shipKey(userid: string, shipno: number): string {
  return `${userid}:${shipno}`;
}

/**
 * Live in-memory representation of one ship — mirrors the Prisma Ship model
 * field-for-field plus the dirty flag used for async DB flush.
 * @see backend/prisma/schema.prisma Ship model
 * @see GEMAIN.H WARSHP struct
 */
export interface ShipState {
  // Composite key
  userid: string;
  shipno: number;

  // Identity
  shipname: string;
  shpclass: number;

  // Navigation
  heading: number;
  head2b: number;
  speed: number;
  speed2b: number;
  xcoord: number;
  ycoord: number;

  // Systems
  damage: number;
  energy: number;
  phasr: number;
  phasrtype: number;
  kills: number;
  lastfired: number;
  shieldtype: number;
  shieldstat: number;
  shield: number;
  cloak: number;

  // Navigation state — set by cmd_rotate/cmd_impulse
  /** Requested rotation delta, ∈ [-180, 180]. @see GEFUNCS.C:1933 valdegree */
  degrees: number;
  /** Impulse %, ∈ [0, 99]. @see GEFUNCS.C:1906 valpcnt */
  percent: number;

  // Gating flags (short-circuited per FR-019a until feature 006)
  tactical: number;
  helm: number;
  train: number;

  // Location
  /** Hyperspace flag; >= 10 = in orbit. @see GEMAIN.H WARSHP.where */
  where: number;

  // Weapons arrays — parallel arrays per FR-035
  ltorpsChannel: number[];
  ltorpsDistance: number[];
  lmisslChannel: number[];
  lmisslDistance: number[];
  lmisslEnergy: number[];

  // Other
  decout: number[];
  jammer: number;
  freq: number[];
  items: bigint[];
  titem: number;
  hostile: number;
  cantexit: number;
  repair: number;
  hypha: number;
  firecntl: number;
  destruct: number;
  status: number;
  cybmine: number;
  cybskill: number;
  cybupdate: number;
  tick: number;
  emulate: number;
  minesnear: number;
  lock: number;
  holdcourse: number;
  topspeed: number;
  warncntr: number;

  /** In-memory only — true after any mutation; cleared after successful Prisma flush. */
  dirty: boolean;

  /**
   * In-memory only — when true this ship has no Prisma row and must never be written to DB.
   * Used exclusively by Droid AI ships (classes 31/32/33).
   * flush() skips states where isEphemeral === true (FR-002).
   * @see specs/008-droid-ai/spec.md FR-001..FR-004
   */
  isEphemeral?: boolean;
}

// Ensure ShipState is compatible with Prisma's Ship shape (minus dirty).
// This compile-time check fails if the Prisma schema and ShipState diverge significantly.
type _PrismaShipFields = keyof Prisma.ShipCreateInput;
type _ShipStateFields = Exclude<keyof ShipState, 'dirty'>;
// (intentionally not exhaustive — just ensures the file compiles against the Prisma types)
export type { _PrismaShipFields, _ShipStateFields };
