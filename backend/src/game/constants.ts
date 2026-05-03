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
 * Energy consumed per acceleration step that keeps speed at or above the warp threshold.
 * Below the warp threshold the step is free.
 * @see GEMAIN.H:76 #define ACCENGAMT 120
 * @see GEFUNCS.C:469-573 accel — `usage = ACCENGAMT` gate
 */
export const ACCENGAMT = 120 as const;

/**
 * Per-tick movement-maintenance debit — paid by player ships only when speed > 0.
 * @see GEMAIN.H:78 #define MOVENGUSE 10
 * @see GEFUNCS.C:733-792 moveship — gated on `status == GESTAT_USER`
 */
export const MOVENGUSE = 10 as const;

/**
 * Energy floor below which the post-debit `speed2b = 0` cutoff fires.
 * @see GEMAIN.H:77 #define MOVENGMIN 3000
 */
export const MOVENGMIN = 3000 as const;

/**
 * Energy debited up-front by the rotate command — pinned defensively here for the
 * balance-regression test even though the physics tick itself does not debit it.
 * @see GEMAIN.H:73 #define ROTENGUSE 30
 */
export const ROTENGUSE = 30 as const;

/**
 * Internal-units boundary between impulse and warp. 1 warp factor = 1000 internal units.
 * @see GEFUNCS.C:482 — `if (ptr->speed < 1000)`
 * @see GEFUNCS.C:493, 538 — hyperspace boundary tests
 */
export const WARP_THRESHOLD = 1000 as const;

/**
 * Position-integration denominator: `dx = speed * sin(deg) / 65000`.
 * @see GEFUNCS.C:648-649 moveship
 */
export const COORD_SCALE = 65000 as const;

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

// ─── Combat constants (006b) ────────────────────────────────────────────────
/** @see GEMAIN.H:xx #define PMINFIRE 60 — minimum phaser charge to fire */
export const PMINFIRE = 60 as const;
/** @see GEMAIN.H:xx #define PRELOAD 10 — phaser reload rate per tick */
export const PRELOAD = 10 as const;
/** @see GEMAIN.H:xx #define PHABIAS 2 — phaser arc bias (extra degrees) */
export const PHABIAS = 2 as const;
/** @see GEMAIN.H:xx #define SHHITENG 1000 — shield energy drained per phaser hit */
export const SHHITENG = 1000 as const;
/** @see GEMAIN.H:xx #define FIRETICKS 10 — battle-lock counter set on fire/hit */
export const FIRETICKS = 10 as const;
/** @see GEMAIN.H:xx #define DECOYTIME 15 — decoy slot lifetime in ticks */
export const DECOYTIME = 15 as const;
/** @see GEMAIN.H:xx #define HPBEAMW 5 — hyper-phaser beam width in degrees */
export const HPBEAMW = 5 as const;
/** @see GEMAIN.H:xx MAXTORPS 3 — max incoming torpedo slots per target */
export const MAXTORPS = 3 as const;
/** @see GEMAIN.H:xx MAXMISSL 3 — max incoming missile slots per target */
export const MAXMISSL = 3 as const;
/** @see GEMAIN.H:xx #define MINERANGE 10000 — mine damage/warning radius */
export const MINERANGE = 10000 as const;
/** @see GEGLOBAL.H tdammax — max torpedo damage roll */
export const TDAMMAX = 200 as const;
/** @see GEGLOBAL.H mdammax — max missile damage roll */
export const MDAMMAX = 300 as const;
/** @see GEGLOBAL.H minedammax — max mine damage */
export const MINEDAMMAX = 150 as const;
/** @see GEGLOBAL.H decodds — decoy intercept probability (0-100 integer) */
export const DECODDS = 50 as const;
/** @see GEGLOBAL.H torpsped — torpedo travel distance per tick */
export const TORPSPED = 500 as const;
/** @see GEGLOBAL.H mislsped — missile travel distance per tick */
export const MISLSPED = 300 as const;
/** @see GEGLOBAL.H misengfc — missile energy divisor for cost: cost = charge / MISENGFC */
export const MISENGFC = 10 as const;
/** @see GEGLOBAL.H jamtime — base jammer counter on deploy */
export const JAMTIME = 20 as const;
/** @see GEGLOBAL.H engymax — canonical default ship energy maximum, restored by `flux`. */
export const ENGYMAX = 50000 as const;

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
