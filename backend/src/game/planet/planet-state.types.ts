/**
 * In-memory representation of a planet's full economic and ownership state.
 * Mirrors the Prisma Planet model field-for-field, with the parallel item arrays
 * exploded into a 14-slot PlanetItem array for ergonomic access.
 * @see GEMAIN.H GALPLNT struct
 */

export interface PlanetItem {
  qty: bigint;       // ITEM.qty       — unsigned long
  rate: number;      // ITEM.rate      — production rate
  sell: boolean;     // ITEM.sell == 'Y'
  reserve: number;   // ITEM.reserve   — purchase floor
  markup2a: number;  // ITEM.markup2a  — non-owner price
  sold2a: bigint;    // ITEM.sold2a    — running counter
}

export interface PlanetState {
  // Composite key (matches @@id([xsect, ysect, plnum]))
  xsect: number;
  ysect: number;
  plnum: number;

  type: number;               // GALPLNT.type
  xcoord: number;
  ycoord: number;

  userid: string | null;      // owner; null = unowned
  name: string;               // ≤19 chars
  enviorn: number;
  resource: number;

  cash: bigint;               // BigInt (FR-036)
  debt: bigint;
  tax: bigint;                // accumulated tax pool
  taxrate: number;
  warnings: number;

  password: string;           // ≤10 chars; "" or "none" = no password
  lastattack: string;
  beacon: string;             // ≤75 chars
  spyowner: string;
  technology: number;
  teamcode: bigint;

  items: PlanetItem[];        // length === NUMITEMS (14)
}

/** Composite key for the in-memory planet state Map. */
export function planetKey(xsect: number, ysect: number, plnum: number): string {
  return `${xsect}:${ysect}:${plnum}`;
}

/** Typed admin-change discriminated union. @see contracts/planet-state-service.md */
export type AdminChange =
  | { type: 'rate';     itemIndex: number; value: number }
  | { type: 'markup';   itemIndex: number; value: number }
  | { type: 'sellflag'; itemIndex: number; value: boolean }
  | { type: 'reserve';  itemIndex: number; value: number }
  | { type: 'taxrate';  value: number }
  | { type: 'beacon';   value: string }
  | { type: 'password'; value: string };
