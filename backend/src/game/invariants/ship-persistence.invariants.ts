import { Invariant, Violation } from './invariants.types';

/**
 * Settle window before in-memory ship state must match its DB row.
 *
 * P-019 (Task 2 walk) surfaced a flush race window — `ShipStateService` sets
 * `dirty=false` after the awaited Prisma write, so a check that fires mid-flush
 * sees a transient mismatch. The Δ window keeps the invariant noise-free.
 */
const FLUSH_SETTLE_MS = 30_000;

/** Fields we compare between in-memory ship state and the DB row. */
const PERSISTED_FIELDS = [
  'xcoord',
  'ycoord',
  'energy',
  'damage',
  'shieldsUp',
  'cargo',
] as const;

type PersistedField = (typeof PERSISTED_FIELDS)[number];

interface ShipLike {
  shipId: string;
  lastFlushedAt?: number;
  [field: string]: unknown;
}

interface DbShipLike {
  userExists?: boolean;
  [field: string]: unknown;
}

function isShipLike(v: unknown): v is ShipLike {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).shipId === 'string';
}

function asDbShipMap(v: unknown): Record<string, DbShipLike> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  return v as Record<string, DbShipLike>;
}

/**
 * Asserts every settled in-memory ship matches its DB row field-for-field
 * across {@link PERSISTED_FIELDS}.
 *
 * Returns `[]` if the snapshot has no `dbShips` slice — Task 8 will gate the
 * DB load behind `INVARIANTS_DB_CHECK=1` so we don't pay the async cost every
 * physics tick.
 *
 * @see P-019 in specs/022-fidelity-audit-v2/findings.md
 * @see backend/src/game/ship/ship-state.service.ts flush path
 */
export const inMemoryShipMatchesDb: Invariant = {
  name: 'inMemoryShipMatchesDb',
  sourceRef: 'ShipStateService flush + P-019 finding',
  run: (world): Violation[] => {
    const dbMap = asDbShipMap(world.dbShips);
    if (!dbMap) return [];
    const ships = (world.ships as unknown[] | undefined) ?? [];
    const now = Date.now();
    const out: Violation[] = [];
    for (const s of ships) {
      if (!isShipLike(s)) continue;
      const lastFlushed = typeof s.lastFlushedAt === 'number' ? s.lastFlushedAt : 0;
      if (lastFlushed > now - FLUSH_SETTLE_MS) continue; // inside settle window
      const dbRow = dbMap[s.shipId];
      if (!dbRow) continue; // handled by noOrphanShipState
      for (const field of PERSISTED_FIELDS) {
        const memVal = s[field as PersistedField];
        const dbVal = dbRow[field];
        if (memVal !== undefined && dbVal !== undefined && memVal !== dbVal) {
          out.push({
            rule: 'inMemoryShipMatchesDb',
            sourceRef: 'ShipStateService flush + P-019 finding',
            severity: 'HIGH',
            detail: `ship ${s.shipId} field ${field} mem=${String(memVal)} db=${String(dbVal)}`,
          });
        }
      }
    }
    return out;
  },
};

/**
 * Asserts every in-memory ship has a backing User row.
 *
 * Commit `618c1dc` ("kick clients with valid JWT but missing User row") guarantees
 * that an orphaned in-memory ship at observation time is a bug — the connection
 * should already have been kicked.
 *
 * @see commit 618c1dc
 */
export const noOrphanShipState: Invariant = {
  name: 'noOrphanShipState',
  sourceRef: 'commit 618c1dc — ghost-user kick',
  run: (world): Violation[] => {
    const dbMap = asDbShipMap(world.dbShips);
    if (!dbMap) return [];
    const ships = (world.ships as unknown[] | undefined) ?? [];
    const out: Violation[] = [];
    for (const s of ships) {
      if (!isShipLike(s)) continue;
      const dbRow = dbMap[s.shipId];
      const userExists = dbRow ? dbRow.userExists === true : false;
      if (!userExists) {
        out.push({
          rule: 'noOrphanShipState',
          sourceRef: 'commit 618c1dc — ghost-user kick',
          severity: 'HIGH',
          detail: `in-memory ship ${s.shipId} has no backing User row`,
        });
      }
    }
    return out;
  },
};
