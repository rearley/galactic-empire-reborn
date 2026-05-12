import { Invariant, Violation } from './invariants.types';

interface Point {
  x: number;
  y: number;
}

interface ScanResultLike {
  /** 'sca' (short), 'sca lo' (long), 'sca ra' (range). */
  scanType: string;
  scanner: Point;
  scanRange: number;
  revealed: Point[];
}

function isPoint(v: unknown): v is Point {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).x === 'number' &&
    typeof (v as Record<string, unknown>).y === 'number'
  );
}

function isScanResult(v: unknown): v is ScanResultLike {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.scanType !== 'string') return false;
  if (typeof o.scanRange !== 'number') return false;
  if (!isPoint(o.scanner)) return false;
  if (!Array.isArray(o.revealed)) return false;
  return o.revealed.every(isPoint);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Asserts that every scanner result only reveals cells within the projection
 * range defined by the scanner's `scanRange` and the scan type.
 *
 * Scan-type ranges, pinned from the Task 5 walk:
 *   - `sca` (short scan)  — reveals targets where `cdistance * 10_000 ≤ scanRange`
 *                           (i.e. distance-in-sectors ≤ scanRange / 10_000).
 *   - `sca lo` (long scan) — projects up to `scanRange / 10_000` sectors radius.
 *                            S-001 confirmed Interceptor (scanRange=100_000) ⇒ 10-sector radius.
 *   - `sca ra` (range scan) — deferred: S-003 projection range is
 *                             `scanRange / ((10 - x)^2 * 10_000)` per cell, too
 *                             complex for a runtime invariant. Skipped here.
 *
 * @see reference/ge-source/GECMDS.C:2640-2721 scan_lo
 * @see backend/src/game/constants.ts projectRangeCell (S-001 doc)
 */
export const scanRangeMatchesScanType: Invariant = {
  name: 'scanRangeMatchesScanType',
  sourceRef: 'GECMDS.C:2640-2721 scan_lo + scanRange pin',
  run: (world): Violation[] => {
    const raw = (world.scanResults as unknown[] | undefined) ?? [];
    const out: Violation[] = [];
    for (const item of raw) {
      if (!isScanResult(item)) continue;
      const type = item.scanType.toLowerCase();
      // sca ra projection is per-cell distance-dependent — see comment above.
      if (type === 'sca ra') continue;
      let maxSectorRadius: number;
      if (type === 'sca lo') {
        maxSectorRadius = item.scanRange / 10_000;
      } else if (type === 'sca' || type === 'sca short' || type === 'short') {
        // sca short reveals only the scanner's current sector + neighbours within scanRange.
        // Distance in sectors must be ≤ scanRange / 10_000.
        maxSectorRadius = item.scanRange / 10_000;
      } else {
        // Unknown scan type — skip rather than false-flag.
        continue;
      }
      for (const cell of item.revealed) {
        const d = distance(item.scanner, cell);
        if (d > maxSectorRadius) {
          out.push({
            rule: 'scanRangeMatchesScanType',
            sourceRef: 'GECMDS.C:2640-2721 scan_lo + scanRange pin',
            severity: 'HIGH',
            detail: `${type} revealed cell (${cell.x},${cell.y}) at dist ${d.toFixed(2)} > max ${maxSectorRadius} (scanRange=${item.scanRange})`,
          });
        }
      }
    }
    return out;
  },
};
