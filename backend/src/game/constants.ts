/**
 * Galaxy dimensions — fixed from original source.
 * @see GEMAIN.H MAXX, MAXY
 */
export const MAXX = 30 as const;
export const MAXY = 15 as const;

/**
 * Physics tick interval in seconds.
 * @see GEMAIN.H TICKTIME
 */
export const TICKTIME = 6 as const;

/**
 * Ship-update tick interval in seconds.
 * @see GEMAIN.H TICKTIME2
 */
export const TICKTIME2 = 1 as const;

/**
 * Range-scan grid width — canonical value from original source.
 * Mirrors SCAN_GRID_WIDTH in specs/003-ship-commands/contracts/shared-types.ts.
 * @see GEMAIN.H:121 #define MAXX 30
 * @see GECMDS.C:2640 scan_lo — `map[MAXY][MAXX]` grid declaration
 */
export const SCAN_GRID_WIDTH = 30 as const; // GEMAIN.H:121

/**
 * Range-scan grid height — canonical value from original source.
 * Mirrors SCAN_GRID_HEIGHT in specs/003-ship-commands/contracts/shared-types.ts.
 * @see GEMAIN.H:122 #define MAXY 15
 * @see GECMDS.C:2721 scan_lo — player centre at map[MAXY/2][MAXX/2]
 */
export const SCAN_GRID_HEIGHT = 15 as const; // GEMAIN.H:122

/**
 * Normal (empty) sector type.
 * @see GEMAIN.H:205
 */
export const SECTYPE_NORMAL = 1 as const;

/**
 * Planet sector type.
 * @see GEMAIN.H:206
 */
export const PLTYPE_PLNT = 2 as const;

/**
 * Wormhole sector type.
 * @see GEMAIN.H:207
 */
export const PLTYPE_WORM = 3 as const;

/**
 * Maximum number of planets that can be placed in the galaxy.
 * @see GEMAIN.H:123
 */
export const MAXPLANETS = 9 as const;

/** Planet lock-time in seconds. @see GEMAIN.C:469 (PLANTOCK; canonical default 30 minutes) */
export const PLANTOCK_SECONDS = 1800 as const;

/** Minimum planet-update tick interval in seconds. @see GEMAIN.C:658 */
export const PLANTIME_MIN_SECONDS = 4 as const;

export interface ProjectTarget {
  xcoord: number;
  ycoord: number;
}

/**
 * Projects a target's coordinates onto the range-scan grid relative to a ship.
 * Returns null if the target falls outside the grid bounds.
 *
 * Formula (GECMDS.C:2675-2718 scan_lo):
 *   range        = scanRange / 1000.0
 *   range_doubled = range * 2.0           (full diameter of scan circle)
 *   xfactor      = range_doubled / (MAXX - 1)
 *   yfactor      = range_doubled / (MAXY - 1)
 *   xf           = (target.x - ship.x) / xfactor + MAXX / 2.0
 *   yf           = (target.y - ship.y) / yfactor + MAXY / 2.0
 *   emit if (0 <= xf < MAXX) && (0 <= yf < MAXY)
 *
 * @see GECMDS.C:2675 range = scanrange / 1000.0
 * @see GECMDS.C:2681 xfactor / yfactor projection
 * @see GECMDS.C:2718 bounds check
 * @see GEMAIN.H:121-122 MAXX=30, MAXY=15
 */
export function projectRangeCell(
  ship: ProjectTarget,
  target: ProjectTarget,
  scanRange: number,
): { x: number; y: number } | null {
  // GECMDS.C:2675 — range = scanrange / 1000.0; then *2 for full diameter
  const range = (scanRange / 1000.0) * 2.0;
  const xfactor = range / (SCAN_GRID_WIDTH - 1); // GECMDS.C:2681
  const yfactor = range / (SCAN_GRID_HEIGHT - 1); // GECMDS.C:2682

  const xf = (target.xcoord - ship.xcoord) / xfactor + SCAN_GRID_WIDTH / 2.0;
  const yf = (target.ycoord - ship.ycoord) / yfactor + SCAN_GRID_HEIGHT / 2.0;

  if (xf >= 0.0 && xf < SCAN_GRID_WIDTH && yf >= 0.0 && yf < SCAN_GRID_HEIGHT) {
    return { x: Math.floor(xf), y: Math.floor(yf) };
  }
  return null;
}
