import { resolveGameConfig } from './config/game-config';

/** Resolved sysop tuning: config/game.config.json, overridden by the environment. */
const GAME_CONFIG = resolveGameConfig();

/**
 * Galaxy dimensions — fixed from original source.
 * @see GEMAIN.H MAXX, MAXY
 */
export const MAXX = 30 as const;
export const MAXY = 15 as const;

/**
 * Intra-sector resolution: a sector is SSMAX units across on each axis.
 * @see GEMAIN.H:104
 */
export const SSMAX = 10000 as const;

// ─── Movement/rotation constants ────────────────────────────────────────────

/** Degrees rotated per tick when rotate command is active.
 * @see GEMAIN.H:74 #define ROTAMT 20 */
export const ROTAMT = 20 as const;

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
 * Long-range scan (`sca lo`) projection multiplier — scaling factor applied
 * to a ship's `scanRange` when projecting the long-range overview.
 *
 * **TS deviation from C-canonical.** The C source hard-codes `× 10` at
 * `GECMDS.C:2668`, but that constant was calibrated for sysop-configurable
 * universes up to 32,767 sectors wide (`UNIVMAX` is `numopt(UNIVMAX,10,32767)`
 * in `GEMAIN.C:474`). Our port hard-codes the minimum `MAXX=30, MAXY=15`
 * (the C-source minimum), so the 10× factor produces a galaxy-wide overview
 * even for a starter Interceptor. A smaller factor restores the "long-range
 * scan is wider than tactical scan but not the whole universe" intent.
 *
 * Dial this up or down to tune how much of the galaxy a ship reveals on
 * `sca lo`. Tune in tandem with per-class `ShipClass.scanRange` (smaller
 * scanRange tightens both tactical and overview; this constant adjusts the
 * overview-to-tactical ratio).
 */
export const SCAN_LO_PROJECTION_MULTIPLIER = 3 as const;

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
 * Number of object SLOTS a sector has — a fixed array bound, not a tunable.
 *
 * `PLNTCOORD planets[MAXPLANETS]` (GEMAIN.H:417) sizes the array, and
 * `plnum <= MAXPLANETS` (GECMDS.C:786, :2312) validates a slot number against
 * it. Always 9.
 *
 * NOT to be confused with the lowercase runtime variable of the same name:
 * `maxplanets = numopt(MAXPLSE,1,9)` (GEMAIN.C:477) is the GENERATION DENSITY
 * option, default 5, and is exported below as MAXPLSE. The port had
 * `MAXPLANETS = GAME_CONFIG.MAXPLSE`, which drove the fixed array bound from
 * the density knob — so lowering the knob to its canon 5 would have made slots
 * 6..9 invalid, and the neutral zone needs six.
 *
 * @see GEMAIN.H:119 #define MAXPLANETS 9
 */
export const MAXPLANETS = 9 as const;

/**
 * Generation density: the upper bound on objects rolled into a sector, as
 * `gernd()%maxplanets` (GEPLANET.C:485), so a sector gets 0..MAXPLSE-1 objects.
 * @see GEMAIN.C:477 maxplanets = numopt(MAXPLSE,1,9)
 */
export const MAXPLSE = GAME_CONFIG.MAXPLSE;

/**
 * Planet frequency: a sector gets objects when `gernd()%plodds == 0`
 * (GEPLANET.C:484), so roughly one sector in PLODDS is populated.
 * @see GEMAIN.C:475 plodds = numopt(PLODDS,1,20)
 */
export const PLODDS = GAME_CONFIG.PLODDS;

/**
 * Wormhole frequency: an object slot becomes a wormhole rather than a planet
 * when `gernd()%wormodds == 0` (GEPLANET.C:548).
 * @see GEMAIN.C:476 wormodds = numopt(WORMODDS,1,100)
 */
export const WORMODDS = GAME_CONFIG.WORMODDS;

/**
 * Max ships a player may own (env MAXSHIPS, 1–50).
 * @see GEMAIN.C:462 numopt(MAXSHIPS,1,50)
 */
export const MAXSHIPS = GAME_CONFIG.MAXSHIPS;

/** Planet lock-time in seconds. @see GEMAIN.C:469 (PLANTOCK; canonical default 30 minutes) */
export const PLANTOCK_SECONDS = 1800 as const;

/** Minimum planet-update tick interval in seconds. @see GEMAIN.C:658 */
export const PLANTIME_MIN_SECONDS = 4 as const;

// ─── Combat constants (006b) ────────────────────────────────────────────────
/** @see GEMAIN.H:81 #define PMINFIRE 60 — minimum phaser charge to fire */
export const PMINFIRE = 60 as const;
/** @see GEMAIN.H:80 #define PRELOAD 10 — phaser reload rate per tick */
export const PRELOAD = 10 as const;
/** @see GEMAIN.H:82 #define PENGUSE 57 — energy consumed per tick while phasers charge */
export const PENGUSE = 57 as const;

/**
 * The reserve `useenergy()` refuses to dip into: it only spends when
 * `energy >= amount + 500`, and returns 0 (spending nothing) otherwise.
 * @see GEFUNCS.C:1500-1514 `if (ptr->energy >= amount+500) /* fudge a bit *\/`
 */
export const USEENERGY_RESERVE = 500 as const;
/** @see GEMAIN.H:83 #define PMINENG 500 — minimum ship energy required to fire phasers */
export const PMINENG = 500 as const;
/** @see GEMAIN.H:84 #define PHABIAS 2 — phaser arc bias (extra degrees) */
export const PHABIAS = 2 as const;
/** @see GEMAIN.H:86 #define HPMINFIR 6000 — minimum flux energy to fire hyper-phaser */
export const HPMINFIR = 6000 as const;
/** @see GEMAIN.H:87 #define HPFIRAMT 5000 — flux energy consumed per hyper-phaser shot */
export const HPFIRAMT = 5000 as const;
/** @see GEMAIN.H:88 #define HPBEAMW 5 — hyper-phaser beam width in degrees */
export const HPBEAMW = 5 as const;
/** @see GEMAIN.H:90 #define ENGYMAX 65000 — maximum energy a ship can have */
export const ENGYMAX = 65000 as const;
/** @see GEMAIN.H:91 #define ENGRECHG 1 — energy recharged per ship-update tick */
export const ENGRECHG = 1 as const;
/** @see GEMAIN.H:92 #define ENGYMIN 5000 — minimum flux energy for auto-load */
export const ENGYMIN = 5000 as const;
/** @see GEMAIN.H:94 #define SHMINPWR 200 — minimum power to raise shields */
export const SHMINPWR = 200 as const;
/** @see GEMAIN.H:95 #define SHENGUSE 100 — energy drained per tick while shields up */
export const SHENGUSE = 100 as const;
/** @see GEMAIN.H:96 #define SHHITENG 1000 — shield energy drained per phaser hit */
export const SHHITENG = 1000 as const;
/** @see GEMAIN.H:97 #define SHMAXCHG 10 — max shield charge level (full) */
export const SHMAXCHG = 10 as const;
/** @see GEMAIN.H:98 #define SHMINCHG 5 — minimum shield charge to be effective */
export const SHMINCHG = 5 as const;
/** @see GEMAIN.H:100 #define SCANADJ 40 — range-scanner display adjustment factor */
export const SCANADJ = 40 as const;
/** @see GEMAIN.H:102 #define TONFACT 15000.0 — tonnage factor divisor for damage scaling */
export const TONFACT = 15000 as const;
/** @see GEMAIN.H:10 #define FIRETICKS 10 — battle-lock counter set on fire/hit */
export const FIRETICKS = 10 as const;
/** @see GEMAIN.H:132 #define DECOYTIME 15 — decoy slot lifetime in ticks */
export const DECOYTIME = 15 as const;
/** @see GEMAIN.H:127 #define MAXDECOY 10 — maximum decoy slots per ship */
export const MAXDECOY = 10 as const;
/** @see GEMAIN.H:199 #define NUM_MINES 20 — maximum concurrent mines in the galaxy */
export const NUM_MINES = 20 as const;
/** @see GEMAIN.H:130 #define HYSCANRANGE 5 — hyperspace scan range (sectors) */
export const HYSCANRANGE = 5 as const;
/** @see GEMAIN.H:136 #define PLANTIME 55 — planet update tick interval */
export const PLANTIME = 55 as const;
/** @see GEMAIN.H:141 #define NUMITEMS 14 — number of cargo item types */
export const NUMITEMS = 14 as const;
/** @see GEMAIN.H:163 #define SHIELD_FACTOR 4 — shield absorption multiplier */
export const SHIELD_FACTOR = 4 as const;
/** @see GEMAIN.H:165 #define COUNTDOWN 20 — self-destruct countdown ticks */
export const COUNTDOWN = 20 as const;
/** @see GEMAIN.H:3 MAXTORPS 3 — max incoming torpedo slots per target */
export const MAXTORPS = 3 as const;
/** @see GEMAIN.H:126 MAXMISSL 3 — max incoming missile slots per target */
export const MAXMISSL = 3 as const;
/** @see GEMAIN.H:195 #define MINERANGE 10000 — mine damage/warning radius */
export const MINERANGE = 10000 as const;
/** @see GEMAIN.H:197 #define DESTRUCTRANGE 10000 — self-destruct blast radius */
export const DESTRUCTRANGE = 10000 as const;
/** @see GEMAIN.H:201 #define TOPSHIELD 19 — highest shield class index */
export const TOPSHIELD = 19 as const;
/** @see GEMAIN.H:203 #define TOPPHASOR 19 — highest phaser class index */
export const TOPPHASOR = 19 as const;
/** @see GEMAIN.H:184 #define TELEDAM 17 — hull damage when ship hits universe edge */
export const TELEDAM = 17 as const;
/** @see GEMAIN.H:181 #define QUADMAXPERTICK 5 — max Cyberquad AI activations per physics tick */
export const QUADMAXPERTICK = 5 as const;
/**
 * Max torpedo damage roll.
 *
 * `numopt(TDAMMAX,1,100)` CLAMPS this to 100 — the port previously used 200, a
 * value the original cannot produce. Torpedo damage rolls as
 * `tdammax * rndm(.5)` (GEFUNCS.C:1555), so at 200 a torpedo reached the
 * 100-damage kill threshold outright; at the legal ceiling it tops out near 50.
 * Env-overridable for playtest tuning, clamped to the original's bounds.
 *
 * @see GEMAIN.C:508 tdammax = (double)numopt(TDAMMAX,1,100)
 */
export const TDAMMAX = GAME_CONFIG.TDAMMAX;
/**
 * Max missile damage roll.
 *
 * `numopt(MDAMMAX,1,100)` clamps this to 100; the port previously used 300.
 *
 * @see GEMAIN.C:511 mdammax = (double)numopt(MDAMMAX,1,100)
 */
export const MDAMMAX = GAME_CONFIG.MDAMMAX;

/**
 * Maximum ion-cannon damage — a planet's defensive battery.
 *
 * `numopt(IDAMMAX,1,100)`. Shields turn a volley into a scratch
 * (`idammax * rndm(.15)`) plus a heavy shield knock; a bare hull takes
 * `idammax * (rndm(.50)+.50)`, which at the default is fatal in two.
 *
 * @see GEMAIN.C:512  @see GEFUNCS.C:1785-1812 fireion
 */
export const IDAMMAX = GAME_CONFIG.IDAMMAX;

/**
 * Maximum energy a missile can be loaded with, and the divisor C normalises a
 * missile's stored charge against before scaling by MDAMMAX.
 *
 * @see GECMDS.C:cmd_missile charge validation  @see GEFUNCS.C:1641 `damfact/50000.0`
 */
export const MISSILE_CHARGE_MAX = 50_000;
/** @see GEGLOBAL.H minedammax — max mine damage */
export const MINEDAMMAX = GAME_CONFIG.MNDAMMAX;
/** @see GEGLOBAL.H decodds — decoy intercept probability (0-100 integer) */
export const DECODDS = GAME_CONFIG.DECODDS;
/** @see GEGLOBAL.H torpsped — torpedo travel distance per tick */
export const TORPSPED = GAME_CONFIG.TORPSPED;
/** @see GEGLOBAL.H mislsped — missile travel distance per tick */
export const MISLSPED = GAME_CONFIG.MISLSPED;
/** @see GEGLOBAL.H misengfc — missile energy divisor for cost: cost = charge / MISENGFC */
export const MISENGFC = GAME_CONFIG.MISENGFC;
/**
 * Base jammer counter on deploy.
 *
 * `numopt(JAMTIME,1,10)` CLAMPS this to 10 — the port previously used 20, so
 * jammers lasted twice the maximum duration the original permits. Semantics
 * match on both sides (`jammer = jamtime * ddist`, GECMDS.C:1644), which is what
 * makes the values directly comparable. Env-overridable, clamped to the bound.
 *
 * @see GEMAIN.C:496 jamtime = numopt(JAMTIME,1,10)
 */
export const JAMTIME = GAME_CONFIG.JAMTIME;
/**
 * Max normal-phaser damage base.
 *
 * `numopt(PDAMMAX,1,200)` supplies only the clamp bounds — the actual value came
 * from a sysop `.cnf` that is not part of the reference source, so there is no
 * canonical figure to preserve. The port initially took the upper bound (200),
 * which made every phaser type one-shot: ships die at `damage >= 100`
 * (combat-tick.service.ts), and phasrtype 1 already computed 155.
 *
 * 25 gives combat an arc — a maxed phaser kills in one point-blank hit, weaker
 * phasers and longer shots take several. Override via the PDAMMAX env var to
 * retune during playtest without a rebuild; clamped to the original's bounds.
 *
 * @see GEMAIN.C:494 numopt(PDAMMAX,1,200)
 */
export const PDAMMAX = GAME_CONFIG.PDAMMAX;
/** @see GEMAIN.C:493 numopt(PFIRDST,1,20) — normal-phaser distance falloff exponent. */
export const PFIRDST = GAME_CONFIG.PFIRDST;
/** @see GEMAIN.C:492 numopt(HPDAMMAX,1,200) — max hyper-phaser damage base (warp branch). */
export const HPDAMMAX = GAME_CONFIG.HPDAMMAX;
/** @see GEMAIN.C:491 numopt(HPFIRDST,1,20) — hyper-phaser distance falloff exponent. */
export const HPFIRDST = GAME_CONFIG.HPFIRDST;
/** @see GEMAIN.C:506-507 numopt(TORFACT,1,50)/10 — torpedo lock-quality divisor. */
export const TORFACT = GAME_CONFIG.TORFACT / 10;
/** @see GEMAIN.C:509-510 numopt(MISFACT,1,50)/10 — missile lock-quality divisor. */
export const MISFACT = GAME_CONFIG.MISFACT / 10;
/** @see GEMAIN.C:463 numopt(SE100DAM,1,101) — self-zap hull damage for firing in the neutral zone. */
export const SE100DAM = GAME_CONFIG.SE100DAM;
/** @see GEMAIN.C:598 numopt(PHATOWRP,0,100) — min phasrtype to hit a warping victim with normal phaser. */
export const PHATOWRP = GAME_CONFIG.PHATOWRP;

/** Shield status: damaged (subsystem hit). @see GEMAIN.H:161 #define SHIELDDM 3 */
export const SHIELDDM = 3 as const;
// Note: SHIELDUP (1) and SHIELDDN (2) are C source values — the port uses 0=down, 1=up, 3=damaged.
// SHIELDDN=2 does not match the port's usage (port uses 0 for "down"), so those constants were
// removed to avoid confusion. SHIELDDM=3 is kept because it IS used in the port.

/** @see GEMAIN.H:220 #define MAIL_CLASS_DISTRESS 1 — mail class for revolt/distress notices */
export const MAIL_CLASS_DISTRESS = 1 as const;

/** Per-player live-mine deployment cap. @see GECMDS.C:1722 usermines */
export const USERMINES = GAME_CONFIG.USRMINES;
/** Minimum timer value for a deployed mine. @see GECMDS.C:1722 */
export const MINE_TIMER_MIN = 1 as const;
/** Maximum timer value for a deployed mine. @see GECMDS.C:1722 */
export const MINE_TIMER_MAX = 50 as const;

/**
 * Universe half-extent — coordinates valid in [-UNIVMAX, +UNIVMAX].
 * @see GEGLOBAL.H:134 univmax
 */
export const UNIVMAX = GAME_CONFIG.UNIVMAX;

// ── Cybertron AI constants (GEMAIN.H) ────────────────────────────────────────

/** @see GEMAIN.H CYBTICKTIME=6 — physics-tick period for Cybertron AI (seconds) */
export const CYBTICKTIME = 6 as const;
/** @see GEMAIN.H CYB_MINCLASS=3 — minimum player class a Cybertron will attack */
export const CYB_MINCLASS = 3 as const;
/** @see GEMAIN.H CYBSLO=3 — 1-in-CYBSLO chance gebemean returns true for ordinary AI */
export const CYBSLO = 3 as const;
/** @see GEMAIN.H CYB_ALLOW=35 — gold allowance per tick for every Cybertron */
export const CYB_ALLOW = 35 as const;
/** @see GEMAIN.H CYB_MAXCASH=2000000 — maximum gold a Cybertron may hold */
export const CYB_MAXCASH = 2_000_000 as const;
/** @see GEMAIN.H CYB_BE_NICE=30 — kill threshold at which Cybertrons get tougher */
export const CYB_BE_NICE = 30 as const;
/** @see GEMAIN.H CYB_BE_EASY=60 — kill threshold at which Cybertrons get really mean */
export const CYB_BE_EASY = 60 as const;
/** @see GEMAIN.H CYB_BREAKOFF=500 — 1-in-CYB_BREAKOFF chance a non-quad breaks off attack */
export const CYB_BREAKOFF = 500 as const;
/** @see GEMAIN.H CYB_MINDAM=75 — damage threshold triggering defensive behavior */
export const CYB_MINDAM = 75 as const;
/** @see GEMAIN.H CYBMAXPERTICK=2 — max AI ship activations per physics tick */
export const CYBMAXPERTICK = 2 as const;
/** @see GEMAIN.H CYB_TOUGH_0=0 — tough_factor value for ordinary Cybertron */
export const CYB_TOUGH_0 = 0 as const;
/** @see GEMAIN.H CYB_TOUGH_1=1 — tough_factor value for Cyberquad (smart/mean) */
export const CYB_TOUGH_1 = 1 as const;
/** @see GEMAIN.H CLASSTYPE_CYBORG=2 — category constant for all Cybertron/Sartern classes */
export const CLASSTYPE_CYBORG = 2 as const;

// ── Droid AI constants (GEMAIN.H / GEDROIDS.C) ───────────────────────────────

/** @see GEMAIN.H CLASSTYPE_DROID=3 — category constant for all Droid classes */
export const CLASSTYPE_DROID = 3 as const;
/** Max live Droids per class (2 × 3 classes = 6 total cap). @see GEDROIDS.C:droid_init */
export const DROID_MAX_PER_CLASS = 2 as const;
/**
 * Droid spawn cadence, counted on the ONE-SECOND tick.
 *
 * C's `autortia` runs once a second and evaluates the spawn slot on every 30th
 * call (`ticktock2 >= 30`, GEMAIN.C:2321), i.e. every 30 seconds. Counting
 * these on the 6-second physics tick instead made it 180 seconds, which is
 * why the starter target was absent for most of a session.
 */
export const DROID_SPAWN_TICK_CADENCE = 30 as const;
/** Annoy roll denominator: gernd()%4 == 1 → ~25% hit rate. @see GEDROIDS.C:droid_annoy:237 */
export const DROID_ANNOY_DENOM = 4 as const;
/** userid prefix for all Droid ships. @see GEDROIDS.C:111 */
export const DROID_USERID_PREFIX = '@Droid-' as const;
/** ShipClass.classNumber for the Lydorian Garbage Scow. @see GEDROIDS.C:droid_act_class_10 */
export const DROID_CLASS_SCOW = 31 as const;
/** ShipClass.classNumber for the Murdonian Transport. @see GEDROIDS.C:droid_act_class_11 */
export const DROID_CLASS_TRANSPORT = 32 as const;
/** ShipClass.classNumber for the Vakory Survey Drone. @see GEDROIDS.C:droid_act_class_12 */
export const DROID_CLASS_VAKORY = 33 as const;
/** GESTAT_AVAIL: ship slot is free. @see GEMAIN.H:209 */
export const GESTAT_AVAIL = 0 as const;
/** GESTAT_USER: active player ship. @see GEMAIN.H:210 */
export const GESTAT_USER = 1 as const;
/** GESTAT_AUTO: AI-controlled ship. @see GEMAIN.H:211 */
export const GESTAT_AUTO = 2 as const;

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
 * Coordinate scale correction: the original C source stored coords in a 0–300×0–150
 * range (10 units per sector). Our backend uses 0–30×0–15 (1 unit per sector).
 * The original formula produces a radius of scanRange/1000 in original units; in our
 * units that is scanRange/10000. Dividing by 10000 instead of 1000 restores the
 * correct projection — Interceptor (scanRange=100000) covers a 10-sector radius,
 * matching the "100k = 10 sectors" comment in GECMDS.C:2668.
 *
 * @see GECMDS.C:2668 range = scanrange * 10.0 (display scale)
 * @see GECMDS.C:2675 range = range / 10000.0  (coordinate scale)
 * @see GECMDS.C:2681 xfactor / yfactor projection
 * @see GECMDS.C:2718 bounds check
 * @see GEMAIN.H:121-122 MAXX=30, MAXY=15
 */
export function projectRangeCell(
  ship: ProjectTarget,
  target: ProjectTarget,
  scanRange: number,
): { x: number; y: number } | null {
  // Original: range = scanrange/1000 in original coord units (0-300 scale).
  // Our coords are 0-30 scale (10× smaller), so divide by 10000 instead of 1000.
  const range = (scanRange / 10000.0) * 2.0;
  const xfactor = range / (SCAN_GRID_WIDTH - 1); // GECMDS.C:2681
  const yfactor = range / (SCAN_GRID_HEIGHT - 1); // GECMDS.C:2682

  const xf = (target.xcoord - ship.xcoord) / xfactor + SCAN_GRID_WIDTH / 2.0;
  const yf = (target.ycoord - ship.ycoord) / yfactor + SCAN_GRID_HEIGHT / 2.0;

  if (xf >= 0.0 && xf < SCAN_GRID_WIDTH && yf >= 0.0 && yf < SCAN_GRID_HEIGHT) {
    return { x: Math.floor(xf), y: Math.floor(yf) };
  }
  return null;
}

// ─── GEMAIN.H Gameplay Pin Map ────────────────────────────────────────────────
/**
 * Explicit map of every gameplay-affecting `#define` from GEMAIN.H.
 * Used by `test/unit/gemain-pins.spec.ts` to assert both directions:
 *   - Every gameplay define in GEMAIN.H appears here with the correct value.
 *   - Every entry here appears in GEMAIN.H with the correct value.
 *
 * Constants excluded from this set are documented in the spec file.
 *
 * @see reference/ge-source/GEMAIN.H
 * @see backend/test/unit/gemain-pins.spec.ts
 */
export const GEMAIN_GAMEPLAY_PINS: Readonly<Record<string, number>> = {
  // ── Movement / Physics ─────────────────────────────────────────────────────
  ROTENGUSE,
  ROTAMT,
  ACCENGAMT,
  MOVENGMIN,
  MOVENGUSE,
  // ── Phaser / Weapon ────────────────────────────────────────────────────────
  PRELOAD,
  PMINFIRE,
  PENGUSE,
  PMINENG,
  PHABIAS,
  HPMINFIR,
  HPFIRAMT,
  HPBEAMW,
  // ── Energy / Shields ───────────────────────────────────────────────────────
  ENGYMAX,
  ENGRECHG,
  ENGYMIN,
  SHMINPWR,
  SHENGUSE,
  SHHITENG,
  SHMAXCHG,
  SHMINCHG,
  SHIELD_FACTOR,
  // ── Scan ──────────────────────────────────────────────────────────────────
  SCANADJ,
  HYSCANRANGE,
  // ── Tonnage / Damage ──────────────────────────────────────────────────────
  TONFACT,
  MINERANGE,
  DESTRUCTRANGE,
  TOPSHIELD,
  TOPPHASOR,
  TELEDAM,
  // ── Galaxy ────────────────────────────────────────────────────────────────
  MAXPLANETS,
  MAXX,
  MAXY,
  SECTYPE_NORMAL,
  PLTYPE_PLNT,
  PLTYPE_WORM,
  // ── Weapons / Items ────────────────────────────────────────────────────────
  MAXTORPS,
  MAXMISSL,
  MAXDECOY,
  NUM_MINES,
  DECOYTIME,
  NUMITEMS,
  // ── Tick / Time ───────────────────────────────────────────────────────────
  TICKTIME,
  TICKTIME2,
  CYBTICKTIME,
  PLANTIME,
  FIRETICKS,
  COUNTDOWN,
  // ── Cybertron AI ──────────────────────────────────────────────────────────
  CYB_MINCLASS,
  CYBSLO,
  CYB_ALLOW,
  CYB_MAXCASH,
  CYB_BE_NICE,
  CYB_BE_EASY,
  CYB_BREAKOFF,
  CYB_MINDAM,
  CYBMAXPERTICK,
  QUADMAXPERTICK,
} as const;

/**
 * Maximum players concurrently IN GAME.
 *
 * GEMAIN.C:2769 — `if (numwar < gemaxplrs)` board a ship, else refuse with
 * NOSHPS. `numwar` counts players currently in the game, so this caps SEATS,
 * not accounts: registration stays open, entry does not.
 *
 * @see GEMAIN.C:459 numopt(MAXPLRS,1,256)
 */
export const MAXPLRS = GAME_CONFIG.MAXPLRS;

/**
 * Maximum planets a SINGLE player may own — not a galaxy-wide total.
 *
 * GECMDS.C:3487 — `if (waruptr->planets >= max_plnts)` refuses a further claim.
 *
 * @see GEMAIN.C:468 numopt(MAXPLNTS,1,256)
 */
export const MAXPLNTS = GAME_CONFIG.MAXPLNTS;

/**
 * Maximum live droids across ALL droid classes.
 *
 * Defaults to 6 — the canonical total, being the three droid classes at their
 * canon `Make` of 2 each (reference/wiki/cpu-ships.md). Left at the option's
 * upper bound of 500 it never bound, since the per-class cap already held the
 * population to 6; at the canonical total it is a real backstop, and raising
 * DROID_MAX_PER_CLASS without also raising this is caught rather than silently
 * doubling the droid population.
 *
 * @see GEMAIN.C:471 numopt(MAXDROID,0,500)
 */
export const MAXDROID = GAME_CONFIG.MAXDROID;
