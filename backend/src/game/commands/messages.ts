import { CANON_MESSAGES } from './canon-messages.generated';
/**
 * Original-game response strings, reconstructed from wiki and prfmsg() call signatures.
 * Source ledger: specs/003-ship-commands/contracts/messages.md
 * SC-001: tests pin character-level exact bytes for representative inputs.
 *
 * @see specs/003-ship-commands/contracts/messages.md
 */

export enum MessageId {
  // impulse
  IMPFMT = 'IMPFMT',
  IMPULSE1 = 'IMPULSE1',
  ENGFIRE = 'ENGFIRE',
  ENGSTOP = 'ENGSTOP',

  // warp
  WARP01 = 'WARP01',
  WARPSPD2 = 'WARPSPD2',
  WARPFMT = 'WARPFMT',
  WARP02 = 'WARP02',
  WARP03 = 'WARP03',
  WARP04 = 'WARP04',

  // rotate
  ROTFMT = 'ROTFMT',
  NOWTURN = 'NOWTURN',
  NOROTPW = 'NOROTPW',
  CANTROT = 'CANTROT',

  // report
  REPFMT = 'REPFMT',
  REP01 = 'REP01',
  DASHES = 'DASHES',
  REP35 = 'REP35',
  REP02 = 'REP02',
  REP03 = 'REP03',
  REP04 = 'REP04',
  REP05 = 'REP05',
  REP06 = 'REP06',
  REP07 = 'REP07',
  REP08 = 'REP08',
  REP32 = 'REP32',
  REP09 = 'REP09',
  REP10 = 'REP10',
  REP11 = 'REP11',
  REP11B = 'REP11B',
  REP14 = 'REP14',
  REP15 = 'REP15',
  REP16 = 'REP16',
  REP17 = 'REP17',
  REP18 = 'REP18',
  REP18A = 'REP18A',
  REP24A = 'REP24A',
  /** @see GEMAIN.C:2859 mnu_fightsub — the `x` exit and its refusal */
  /** @see GEMAIN.C:3550 update_items — the shared 100% production budget */
  ADMEN2FA = 'ADMEN2FA',
  ADMEN2FB = 'ADMEN2FB',
  CANTEXT = 'CANTEXT',
  EXIWAR2 = 'EXIWAR2',
  REP23 = 'REP23',
  REP24 = 'REP24',
  REP12 = 'REP12',
  REP13 = 'REP13',
  REP25 = 'REP25',
  REP26 = 'REP26',
  REP27 = 'REP27',
  REP28 = 'REP28',
  REP30 = 'REP30',
  REP31 = 'REP31',
  REP31A = 'REP31A',

  // scan
  SCANFMT = 'SCANFMT',
  TABROKE = 'TABROKE',
  JAMMER4 = 'JAMMER4',
  SCAN_NOT_IN_FLIGHT = 'SCAN_NOT_IN_FLIGHT',

  // scan pl — planet status block (feature 004)
  // @see specs/004-galaxy-generator/contracts/scan-projection.md §"Message catalogue additions"
  NO_SUCH_PLANET = 'NO_SUCH_PLANET',
  /** @see GE/REL/MBMGEMSG.MSG:5829 MINE6 — neutron mine proximity warning */
  MINE6 = 'MINE6',
  /** @see GE/REL/MBMGEMSG.MSG:3621 SCAN24 — range-scan header, RAW distance */
  SCAN24 = 'SCAN24',
  /** @see GE/REL/MBMGEMSG.MSG:3625 SCAN25 — sector-scan header, no range */
  SCAN25 = 'SCAN25',
  // `sca sh` — the full intelligence report. @see GECMDS.C:2226-2258
  SCAN01 = 'SCAN01',
  SCAN01A = 'SCAN01A',
  SCAN02 = 'SCAN02',
  SCAN02A = 'SCAN02A',
  SCAN03 = 'SCAN03',
  SCAN03A = 'SCAN03A',
  SCAN04 = 'SCAN04',
  SCAN04A = 'SCAN04A',
  SCAN05 = 'SCAN05',
  SCAN06 = 'SCAN06',
  SCAN07 = 'SCAN07',
  SCAN07A = 'SCAN07A',
  SCAN08 = 'SCAN08',
  SCAN_DASHES = 'SCAN_DASHES',
  SCAN09 = 'SCAN09',
  SCAN1 = 'SCAN1',
  SCAN2 = 'SCAN2',
  SCAN3 = 'SCAN3',
  SCAN10 = 'SCAN10',
  SCAN11 = 'SCAN11',
  SCAN12 = 'SCAN12',
  SCAN13 = 'SCAN13',
  SCAN14 = 'SCAN14',
  SCAN15 = 'SCAN15',
  SCAN16 = 'SCAN16',
  SCAN_LOCATED_IN = 'SCAN_LOCATED_IN',

  // scan pl beacon (feature 005)
  SCAN_BEACON = 'SCAN_BEACON',

  // orbit (feature 005) — GECMDS.C:758 cmd_orbit
  ORBIT01 = 'ORBIT01',
  ORBITALR = 'ORBITALR',
  ORBITNO = 'ORBITNO',
  /** @see GE/REL/MBMGEMSG.MSG ORBIT0 — you cannot orbit a wormhole */
  ORBIT0 = 'ORBIT0',
  ORBITPK = 'ORBITPK',
  ORBIT_TOO_FAR = 'ORBIT_TOO_FAR',
  ABAN_CONFIRM_PLANET = 'ABAN_CONFIRM_PLANET',
  ABAN_CONFIRM_SHIP = 'ABAN_CONFIRM_SHIP',
  ABAN_CANCELLED = 'ABAN_CANCELLED',
  TRAN_NO_ROOM = 'TRAN_NO_ROOM',
  WTHDR_TOO_MUCH = 'WTHDR_TOO_MUCH',
  WTHDR_FMT = 'WTHDR_FMT',
  PRICE_NONE = 'PRICE_NONE',

  // land (feature 005)
  LAND_NOT_ORBIT = 'LAND_NOT_ORBIT',
  LAND_NAME_PROMPT = 'LAND_NAME_PROMPT',
  LAND_INVALID_NAME = 'LAND_INVALID_NAME',
  LAND_CLAIMED = 'LAND_CLAIMED',
  LAND_PLANET_LIMIT = 'LAND_PLANET_LIMIT',
  LAND_NEUTRAL_ZONE = 'LAND_NEUTRAL_ZONE',
  LAND_OK = 'LAND_OK',
  LAND_REFUSED = 'LAND_REFUSED',
  LAND_PASSFAIL = 'LAND_PASSFAIL',

  // buy (feature 005) — GECMDS.C:4201 cmd_buy
  BUYFMT = 'BUYFMT',
  BUY1 = 'BUY1',
  BUY2 = 'BUY2',
  BUY3 = 'BUY3',
  BUY4 = 'BUY4',
  BUY5 = 'BUY5',
  BUYPAS1 = 'BUYPAS1',
  BUYPAS3 = 'BUYPAS3',
  BUYPAS4 = 'BUYPAS4',

  // multi-ship (feature 030) — ship creation/selection
  NEW_FLEET_FULL = 'NEW_FLEET_FULL',
  SHIP_SELECT_HEADER = 'SHIP_SELECT_HEADER',

  // sell (feature 005) — GECMDS.C:4103 cmd_sell
  SELLFMT = 'SELLFMT',
  SELL1 = 'SELL1',
  SELL2 = 'SELL2',
  SELL3 = 'SELL3',

  // admin (feature 005) — GECMDS.C:3462 cmd_admin
  ADM_NOT_LANDED = 'ADM_NOT_LANDED',
  ADM_NOT_OWNER = 'ADM_NOT_OWNER',
  ADM_CLAIM_OFFER = 'ADM_CLAIM_OFFER',
  ADM_CLAIM_DECLINED = 'ADM_CLAIM_DECLINED',
  ADM_MENU = 'ADM_MENU',
  ADM_INVALID = 'ADM_INVALID',
  ADM_OK = 'ADM_OK',

  // withdraw (feature 005)
  WTHDR_NOT_LANDED = 'WTHDR_NOT_LANDED',
  WTHDR_NOT_OWNER = 'WTHDR_NOT_OWNER',
  WTHDR_OK = 'WTHDR_OK',
  WTHDR_NONE = 'WTHDR_NONE',

  // report cargo (feature 005)
  REP_CARGO_LINE = 'REP_CARGO_LINE',
  REP_CARGO_TOTAL = 'REP_CARGO_TOTAL',
  REP_CARGO_NONE = 'REP_CARGO_NONE',

  // phaser (feature 006b) — GECMDS.C:cmd_phasor
  PHA_NOPHAS = 'PHA_NOPHAS',
  PHA_NOPOW = 'PHA_NOPOW',
  PHA_FMT = 'PHA_FMT',
  PHA_CLOAK = 'PHA_CLOAK',
  WPN_ZAP = 'WPN_ZAP',
  HP_NOPOW = 'HP_NOPOW',
  HP_WAIT = 'HP_WAIT',

  // torpedo (feature 006b) — GECMDS.C:cmd_torpedo
  TOR_NOTOR = 'TOR_NOTOR',
  TOR_WARP = 'TOR_WARP',
  TOR_CLOAK = 'TOR_CLOAK',
  TOR_NOAMMO = 'TOR_NOAMMO',
  TOR_FULL = 'TOR_FULL',
  TOR_FMT = 'TOR_FMT',

  // missile (feature 006b) — GECMDS.C:cmd_missl
  MIS_NOMIS = 'MIS_NOMIS',
  MIS_CLOAK = 'MIS_CLOAK',
  MIS_NOAMMO = 'MIS_NOAMMO',
  MIS_FULL = 'MIS_FULL',
  MIS_FMT = 'MIS_FMT',

  // mine / zipper / decoy / jammer / sys (feature 006b Phase 5)
  MIN_NOMINE = 'MIN_NOMINE',
  MIN_CLOAK = 'MIN_CLOAK',
  MIN_NEUTRAL = 'MIN_NEUTRAL',
  MIN_NOAMMO = 'MIN_NOAMMO',
  MIN_FULL = 'MIN_FULL',
  /** @see GE/REL/MBMGEMSG.MSG:5814 MINE2 — the galaxy mine table is full */
  MIN_JAMMED = 'MIN_JAMMED',
  /** @see GE/REL/MBMGEMSG.MSG:5810 MINE3 — reports the fuse it was set to */
  MIN_DEPLOYED = 'MIN_DEPLOYED',
  ZIP_NOAMMO = 'ZIP_NOAMMO',
  ZIP_SWEPT = 'ZIP_SWEPT',
  DEC_NOAMMO = 'DEC_NOAMMO',
  DEC_DEPLOYED = 'DEC_DEPLOYED',
  JAM_NOAMMO = 'JAM_NOAMMO',
  JAM_FIRED = 'JAM_FIRED',
  SYS_UNJAM = 'SYS_UNJAM',
  SYS_UNKNOWN = 'SYS_UNKNOWN',
  SYS_FMT = 'SYS_FMT',
  SYS_HUH = 'SYS_HUH',
  /** LOCK2 — to the TARGET when a fire-control lock is acquired on it. */
  LOCK_WARN_ACQUIRED = 'LOCK_WARN_ACQUIRED',
  /** LOCK4 — to the TARGET when a lock is ATTEMPTED and fails. */
  LOCK_WARN_ATTEMPT = 'LOCK_WARN_ATTEMPT',
  /** TFIRE2 — to the TARGET as a torpedo leaves the tube. */
  TORP_INBOUND = 'TORP_INBOUND',
  /** MFIRE2 — to the TARGET as a missile leaves the tube. */
  MISSILE_INBOUND = 'MISSILE_INBOUND',
  /** TORP1 — per-tick tracking alert to the ship being chased. No argument. */
  TORP_TRACKING = 'TORP_TRACKING',
  /** MISSL1 — per-tick tracking alert for a missile. No argument. */
  MISSILE_TRACKING = 'MISSILE_TRACKING',
  /** SELFD6 — a shielded ship caught in a self-destruct blast. */
  DESTRUCT_BLAST_DEFLECTED = 'DESTRUCT_BLAST_DEFLECTED',
  /** SELFD7 — an unshielded ship caught in a self-destruct blast. */
  DESTRUCT_BLAST_HIT = 'DESTRUCT_BLAST_HIT',
  /** NEW5 — `new` attempted anywhere but in orbit around Zygor. */
  NEW_WRONG_PLACE = 'NEW_WRONG_PLACE',
  /** TRANSFR4 — `tra down` refused because the planet is not ours. */
  TRAN_DOWN_NOT_OWNER = 'TRAN_DOWN_NOT_OWNER',
  /** TRANSUP4 — `tra up` refused because the planet is not ours. */
  TRAN_UP_NOT_OWNER = 'TRAN_UP_NOT_OWNER',
  /** ORBIT4 — `orb` attempted from hyperspace. */
  ORBIT_HYPERSPACE = 'ORBIT_HYPERSPACE',
  /** TOOMANY — `tea create` refused because MAXTEAMS teams already exist. */
  TEAM_TOO_MANY = 'TEAM_TOO_MANY',
  /** WARP — the helm calling out an integer warp factor as it passes. */
  HELM_WARP = 'HELM_WARP',
  /** NOACCEL — the engines shut down for want of flux. */
  HELM_NOACCEL = 'HELM_NOACCEL',
  /** HPFIRED — to the firer, as the hyper-phaser discharges. */
  HP_FIRED = 'HP_FIRED',
  /** HPHITM — to the firer, on a hyper-phaser hit. */
  HP_HIT_MINE = 'HP_HIT_MINE',
  /** HPHITU — to the VICTIM of a hyper-phaser hit. */
  HP_HIT_YOU = 'HP_HIT_YOU',
  /** PHREPR — the phaser bank is functional again. */
  REPAIR_PHASER = 'REPAIR_PHASER',
  /** TAREPR — the tactical display is functioning again. */
  REPAIR_TACTICAL = 'REPAIR_TACTICAL',
  /** HLREPR — the helm is functioning again. */
  REPAIR_HELM = 'REPAIR_HELM',
  /** FCREPR — fire control is functioning again. */
  REPAIR_FIRECNTL = 'REPAIR_FIRECNTL',
  /** PHSRUP — the bank can fire at all. */
  PHASER_MIN_POWER = 'PHASER_MIN_POWER',
  /** PHSRMAX — the bank is at 100%. */
  PHASER_FULL_POWER = 'PHASER_FULL_POWER',
  /** SHDNNOP — shields fell for want of power. */
  SHIELDS_NO_POWER = 'SHIELDS_NO_POWER',
  /** SHREPR — the shield generator is repaired. */
  SHIELDS_REPAIRED = 'SHIELDS_REPAIRED',
  /** CLOKUP — the cloak ramp completed; fully invisible. */
  CLOAK_FULL = 'CLOAK_FULL',
  /** CLREPR — the cloaking device is functional again. */
  CLOAK_REPAIRED = 'CLOAK_REPAIRED',
  /** MAINT7 — a paid repair finished. */
  MAINT_COMPLETE = 'MAINT_COMPLETE',
  /** MAINT10 — a paid repair was cancelled because someone fired. */
  MAINT_INTERRUPTED = 'MAINT_INTERRUPTED',
  /** KILLGOT1 — opens the killer's salvage report; the item list is appended. */
  KILL_SALVAGE = 'KILL_SALVAGE',
  /** KILLPNTS — what the kill scored, and for what class of ship. */
  KILL_POINTS = 'KILL_POINTS',

  // lock (feature 006b Phase 6) — GECMDS.C:1441 cmd_lock
  LOC_SELF = 'LOC_SELF',
  LOC_NOTFOUND = 'LOC_NOTFOUND',
  LOC_LOCKED = 'LOC_LOCKED',
  LOC_FMT = 'LOC_FMT',
  NOLOCK = 'NOLOCK',

  // shield (feature 006b Phase 6) — GECMDS.C cmd_shield
  SHI_UP = 'SHI_UP',
  SHI_DN = 'SHI_DN',
  SHI_FMT = 'SHI_FMT',
  SHIELD0 = 'SHIELD0',
  SHLD1 = 'SHLD1',
  SHLD2 = 'SHLD2',
  SHNOPWR = 'SHNOPWR',
  SHNORPR = 'SHNORPR',

  // flux (feature 006b Phase 6) — GECMDS.C:735-752 cmd_flux
  FLUX_NOPODS = 'FLUX_NOPODS',
  FLUX_USED = 'FLUX_USED',
  FLUX_FMT = 'FLUX_FMT',
  FLUX_LAST = 'FLUX_LAST',

  // who (feature 012) — GECMDS.C:5162 cmd_who reinterpreted
  WHO_HEADER = 'WHO_HEADER',
  WHO_ROW = 'WHO_ROW',

  // dat (feature 012) — GECMDS.C:5829 cmd_data reinterpreted
  DAT_HEADER = 'DAT_HEADER',
  DAT_LINE = 'DAT_LINE',
  DAT_NOT_FOUND = 'DAT_NOT_FOUND',

  // ros (feature 012) — GECMDS.C:5276 cmd_geroster
  ROS_HEADER = 'ROS_HEADER',
  ROS_ROW = 'ROS_ROW',

  // sen (feature 012) — GECMDS.C:1825 cmd_send
  MSG_USAGE_SEN = 'MSG_USAGE_SEN',
  MSG_SENT = 'MSG_SENT',
  MSG_SENT_SECTOR = 'MSG_SENT_SECTOR',
  MSG_SENT_HYPER = 'MSG_SENT_HYPER',
  MSG_BADCOM = 'MSG_BADCOM',
  FRE_BADFREQ = 'FRE_BADFREQ',
  FRE_HAIL = 'FRE_HAIL',
  FRE_SECTOR = 'FRE_SECTOR',
  FRE_GALAXY = 'FRE_GALAXY',

  // fre (feature 012) — GECMDS.C:1885 cmd_freq
  MSG_USAGE_FRE = 'MSG_USAGE_FRE',

  // tea (feature 012) — GECMDS.C:5277 cmd_team (subset)
  TEAM_NONE = 'TEAM_NONE',
  TEAM_CURRENT = 'TEAM_CURRENT',
  TEAM_LEFT = 'TEAM_LEFT',
  TEAM_JOINED = 'TEAM_JOINED',
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',

  // cloak (feature 013) — GECMDS.C:3188 cmd_cloak
  CLOAK_ENGAGED = 'CLOAK_ENGAGED',
  CLOAK_ALREADY_ON = 'CLOAK_ALREADY_ON',
  CLOAK_NO_ENERGY = 'CLOAK_NO_ENERGY',
  CLOAK_DAMAGED = 'CLOAK_DAMAGED',
  CLOAK_HYPERSPACE = 'CLOAK_HYPERSPACE',
  CLOAK_DISENGAGED = 'CLOAK_DISENGAGED',
  CLOAK_ALREADY_OFF = 'CLOAK_ALREADY_OFF',
  CLOAK_FMT = 'CLOAK_FMT',
  CLOAK_SECTOR_DECLOAKED = 'CLOAK_SECTOR_DECLOAKED',
  CLOAK_COLLAPSED = 'CLOAK_COLLAPSED',

  // maint (feature 013) — GECMDS.C:4452 cmd_maint
  MAINT_NOT_ORBIT = 'MAINT_NOT_ORBIT',
  MAINT_NO_FACILITY = 'MAINT_NO_FACILITY',
  MAINT_COMBAT = 'MAINT_COMBAT',
  MAINT_NZ = 'MAINT_NZ',
  MAINT_NO_CASH = 'MAINT_NO_CASH',
  MAINT_OK = 'MAINT_OK',

  // transfer (feature 013) — GECMDS.C:3271 cmd_transfer reinterpreted
  TRAN_SELF = 'TRAN_SELF',
  TRAN_OFFLINE = 'TRAN_OFFLINE',
  TRAN_SECTOR = 'TRAN_SECTOR',
  TRAN_NO_CARGO = 'TRAN_NO_CARGO',
  TRAN_NO_GOLD = 'TRAN_NO_GOLD',
  TRAN_UNKNOWN_ITEM = 'TRAN_UNKNOWN_ITEM',
  TRAN_OK = 'TRAN_OK',
  TRAN_RECEIVED = 'TRAN_RECEIVED',
  TRAN_FMT = 'TRAN_FMT',
  TRAN_NOT_ORBIT = 'TRAN_NOT_ORBIT',
  TRAN_NOT_OWNER = 'TRAN_NOT_OWNER',
  TRAN_PLANET_LOW = 'TRAN_PLANET_LOW',
  TRAN_DOWN_OK = 'TRAN_DOWN_OK',
  TRAN_UP_OK = 'TRAN_UP_OK',

  // jettison (feature 013) — GECMDS.C:6102 cmd_jettison
  JET_NO_CARGO = 'JET_NO_CARGO',
  JET_OK = 'JET_OK',
  JET_FMT = 'JET_FMT',

  // set (feature 013) — GECMDS.C:5190 cmd_set reinterpreted
  SET_OK_ON = 'SET_OK_ON',
  SET_OK_OFF = 'SET_OK_OFF',
  SET_UNKNOWN = 'SET_UNKNOWN',
  SET_STATUS = 'SET_STATUS',
  SET_FMT = 'SET_FMT',

  // destruct (feature 013) — GECMDS.C:5025 cmd_destruct
  DESTRUCT_NZ = 'DESTRUCT_NZ',
  DESTRUCT_START = 'DESTRUCT_START',
  DESTRUCT_TICK = 'DESTRUCT_TICK',
  DESTRUCT_TICK_10 = 'DESTRUCT_TICK_10',
  DESTRUCT_TICK_5 = 'DESTRUCT_TICK_5',
  DESTRUCT_TICK_2 = 'DESTRUCT_TICK_2',
  DESTRUCT_BOOM = 'DESTRUCT_BOOM',
  DESTRUCT_BOOM_SECTOR = 'DESTRUCT_BOOM_SECTOR',

  // abort (feature 013) — GECMDS.C:5044 cmd_abort
  ABORT_OK = 'ABORT_OK',
  ABORT_NONE = 'ABORT_NONE',
  ABORT_SECTOR = 'ABORT_SECTOR',

  // abandon (feature 013) — GECMDS.C:3420 cmd_abandon reinterpreted
  ABANDON_OK = 'ABANDON_OK',
  ABANDON_SECTOR = 'ABANDON_SECTOR',
  ABANDON_NO_SHIP = 'ABANDON_NO_SHIP',
  // canonical `aba` — colony abandonment (GECMDS.C:3420)
  ABAN01 = 'ABAN01',
  ABAN02 = 'ABAN02',
  ABAN03 = 'ABAN03',

  // nav (feature 016) — GECMDS.C:5120 cmd_navigate
  NAVFMT = 'NAVFMT',
  NAV01 = 'NAV01',
  /** @see MBMGEMSG.MSG:2904 LEAVEORB */
  LEAVEORB = 'LEAVEORB',
  /** @see MBMGEMSG.MSG:2276 SHLDCHP — shields begin charging */
  SHLDCHP = 'SHLDCHP',
  /** @see MBMGEMSG.MSG:2280 SHLDUP — shields reach full charge */
  SHLDUP = 'SHLDUP',
  /** @see MBMGEMSG.MSG:2285 SHLDAT — per-tick charge percentage */
  SHLDAT = 'SHLDAT',
  /** @see MBMGEMSG.MSG:2302 SHLDDN — firing drops your shields */
  SHLDDN = 'SHLDDN',
  /** @see MBMGEMSG.MSG:2099-1840 YOURDEAD — told to the pilot who just died */
  YOURDEAD = 'YOURDEAD',
  /** @see MBMGEMSG.MSG PFIRED — discharge notice to the firer */
  PFIRED = 'PFIRED',
  /** @see MBMGEMSG.MSG PHITHIM — to the firer, damage dealt to an unshielded victim */
  PHITHIM = 'PHITHIM',
  /** @see MBMGEMSG.MSG PHITYOU — to the victim, damage taken */
  /**
   * Canon prints a DIFFERENT message per weapon when you are hit. PHITYOU is
   * the phaser one only — `firep` (GECMDS.C:987-996). The port routed every
   * COMBAT_HIT through it, so a mine blast announced itself as "Phaser hit
   * from Commander an unknown assailant's ship" — the wrong weapon AND an
   * attacker canon never claims for a mine.
   */
  THIT1 = 'THIT1',
  THIT2 = 'THIT2',
  MHIT1 = 'MHIT1',
  MHIT2 = 'MHIT2',
  MINE4 = 'MINE4',
  PHITYOU = 'PHITYOU',
  /** @see MBMGEMSG.MSG PDEFLECT — to the firer, the beam was turned by shields */
  PDEFLECT = 'PDEFLECT',
  /** @see MBMGEMSG.MSG PHITDEF — to the victim, a deflected hit and its magnitude */
  PHITDEF = 'PHITDEF',

  // spy (feature 016) — GECMDS.C cmd_spy
  SPY1 = 'SPY1',
  SPY0 = 'SPY0',
  SPY0B = 'SPY0B',
  SPY0C = 'SPY0C',
  SPYM0 = 'SPYM0',
  SPYM1 = 'SPYM1',

  // hel (feature 016) — GECMDS.C cmd_help
  HELFMT = 'HELFMT',
  HEL_UNKNOWN = 'HEL_UNKNOWN',

  // att (feature 014) — GECMDS.C:3515 cmd_attack
  ATT_NOT_ORBIT = 'ATT_NOT_ORBIT',
  ATT_NO_CAPABILITY = 'ATT_NO_CAPABILITY',
  ATT_WORMHOLE = 'ATT_WORMHOLE',
  ATT_SELF = 'ATT_SELF',
  ATT_FORMAT = 'ATT_FORMAT',
  ATT_NO_TROOPS = 'ATT_NO_TROOPS',
  ATT_NO_FIGHTERS = 'ATT_NO_FIGHTERS',
  ATT_LOSS_REPORT = 'ATT_LOSS_REPORT',
  ATT_WIN_TROOP = 'ATT_WIN_TROOP',
  ATT_WIN_FIGHTER = 'ATT_WIN_FIGHTER',
  ATT_RETREAT = 'ATT_RETREAT',
  ATT_TROOP_LAUNCH = 'ATT_TROOP_LAUNCH',
  ATT_FIG_LAUNCH = 'ATT_FIG_LAUNCH',
  ATT_TROOP_COUNTER = 'ATT_TROOP_COUNTER',
  ATT_TROOP_COUNTER_KILL = 'ATT_TROOP_COUNTER_KILL',
  ATT_FIG_LOSS_REPORT = 'ATT_FIG_LOSS_REPORT',
  ATT_FIG_ITEM_DESTROYED = 'ATT_FIG_ITEM_DESTROYED',
  ATT_FIG_RESOLVED = 'ATT_FIG_RESOLVED',
  ATT_WON = 'ATT_WON',
  ATT_STANDOFF = 'ATT_STANDOFF',
  ATT_ITEM_DESTROYED = 'ATT_ITEM_DESTROYED',
  ATT_RESOLVED = 'ATT_RESOLVED',
  ATT_OWNER_ALERT = 'ATT_OWNER_ALERT',
  ATT_GROUND_AA = 'ATT_GROUND_AA',

  // pln (feature 014) — GECMDS.C cmd_pln
  PLN_HEADER = 'PLN_HEADER',
  PLN_NONE = 'PLN_NONE',
  PLN_ROW = 'PLN_ROW',

  // pri (feature 014) — GECMDS.C:4284 cmd_price
  PRICEFMT = 'PRICEFMT',
  PRICE1 = 'PRICE1',
  PRICE_NO_CASH = 'PRICE_NO_CASH',
  BUY7 = 'BUY7',
  BUY8 = 'BUY8',
  /** @see MBMGEMSG.MSG:3309 BUY9 — the purchase confirmation */
  BUY9 = 'BUY9',
  /** @see MBMGEMSG.MSG:2122 KILLEDBY — galaxy-wide kill announcement */
  KILLEDBY = 'KILLEDBY',
  /** @see MBMGEMSG.MSG:2226 SPEEDIS — helm answers a speed change */
  /** @see GE/REL/MBMGEMSG.MSG:2630 MISSL2 — a warp jump shook the missile off */
  MISSL2 = 'MISSL2',
  SPEEDIS = 'SPEEDIS',
  /** @see MBMGEMSG.MSG:2231 SPEED0 — helm answers a full stop */
  SPEED0 = 'SPEED0',
  /** @see MBMGEMSG.MSG:3946 NEW7 — Yardmaster fits a shield */
  NEW7 = 'NEW7',
  /** @see MBMGEMSG.MSG:3960 NEW10 — Yardmaster fits a phaser */
  NEW10 = 'NEW10',
  /** @see MBMGEMSG.MSG:3982 NEW17 — minimum install charge */
  NEW17 = 'NEW17',
  /** @see MBMGEMSG.MSG:3986 NEW18 — shield downgrade refund */
  NEW18 = 'NEW18',
  /** @see MBMGEMSG.MSG:3990 NEW19 — trade-in credit on the old shield */
  NEW19 = 'NEW19',
  /** @see MBMGEMSG.MSG:3996 NEW28 — phaser downgrade refund */
  NEW28 = 'NEW28',
  /** @see MBMGEMSG.MSG:4001 NEW29 — trade-in credit on the old phaser */
  NEW29 = 'NEW29',

  // maint password gate (feature 014) — GECMDS.C:4471 MAINT2, :4479 MAINT3
  MAINT2 = 'MAINT2',
  MAINT3 = 'MAINT3',

  // distress mail types (feature 014) — GECMDS.C:3760-3771 / 3924-3936
  MESG02 = 'MESG02',
  MESG03 = 'MESG03',
  MESG04 = 'MESG04',
  MESG05 = 'MESG05',

  // torpedo / missile lock-quality gates (feature 023) — GECMDS.C:1363-1395
  LOCK_FAIL = 'LOCK_FAIL',
  LOCK_UNREACHABLE = 'LOCK_UNREACHABLE',
  LOCK_NEUTRAL = 'LOCK_NEUTRAL',
  // fire control damaged gate — GECMDS.C:1346-1351 lockon first check
  FCBROKE = 'FCBROKE',

  // shared
  HLBROKE = 'HLBROKE',
  NUMOOR = 'NUMOOR',
  UNKNOWN_CMD = 'UNKNOWN_CMD',
  FORHELP = 'FORHELP',
  SHIP_ABANDONED = 'SHIP_ABANDONED',
}

/**
 * Format strings indexed by MessageId.
 * %s = string arg, %d/%u = integer arg, %.1f = float arg.
 * @see specs/003-ship-commands/contracts/messages.md for per-message source anchors
 */
const MESSAGE_STRINGS: Record<MessageId, string> = {
  // impulse — GECMDS.C:482
  [MessageId.IMPFMT]: CANON_MESSAGES.IMPFMT,
  [MessageId.IMPULSE1]: CANON_MESSAGES.IMPULSE1,
  [MessageId.ENGFIRE]: CANON_MESSAGES.ENGFIRE,
  [MessageId.ENGSTOP]: 'Engines cut. Coasting to a stop.',

  // warp — GECMDS.C:561
  [MessageId.WARP01]: CANON_MESSAGES.WARP01,
  [MessageId.WARPSPD2]: CANON_MESSAGES.WARPSPD2,
  [MessageId.WARPFMT]: CANON_MESSAGES.WARPFMT,
  [MessageId.WARP02]: CANON_MESSAGES.WARP02,
  // MBMGEMSG.MSG:2181 WARP03, verbatim.
  [MessageId.WARP03]: CANON_MESSAGES.WARP03,
  [MessageId.WARP04]: CANON_MESSAGES.WARP04,

  // rotate — GECMDS.C:643
  [MessageId.ROTFMT]: CANON_MESSAGES.ROTFMT,
  [MessageId.NOWTURN]: CANON_MESSAGES.NOWTURN,
  [MessageId.NOROTPW]: CANON_MESSAGES.NOROTPW,
  [MessageId.CANTROT]: CANON_MESSAGES.CANTROT,

  // report — GECMDS.C:1946
  [MessageId.REPFMT]: CANON_MESSAGES.REPFMT,
  [MessageId.REP01]: CANON_MESSAGES.REP01,
  [MessageId.DASHES]: CANON_MESSAGES.DASHES,
  [MessageId.REP35]: CANON_MESSAGES.REP35,
  [MessageId.REP02]: CANON_MESSAGES.REP02,
  [MessageId.REP03]: CANON_MESSAGES.REP03,
  [MessageId.REP04]: CANON_MESSAGES.REP04,
  [MessageId.REP05]: CANON_MESSAGES.REP05,
  [MessageId.REP06]: CANON_MESSAGES.REP06,
  [MessageId.REP07]: CANON_MESSAGES.REP07,
  [MessageId.REP08]: CANON_MESSAGES.REP08,
  [MessageId.REP32]: CANON_MESSAGES.REP32,
  [MessageId.REP09]: CANON_MESSAGES.REP09,
  [MessageId.REP10]: CANON_MESSAGES.REP10,
  [MessageId.REP11]: CANON_MESSAGES.REP11,
  [MessageId.REP11B]: CANON_MESSAGES.REP11B,
  [MessageId.REP14]: CANON_MESSAGES.REP14,
  // rep sys subsystem lines — GECMDS.C:2041-2050
  [MessageId.REP15]: CANON_MESSAGES.REP15,
  [MessageId.REP16]: CANON_MESSAGES.REP16,
  [MessageId.REP17]: CANON_MESSAGES.REP17,
  [MessageId.REP18]: CANON_MESSAGES.REP18,
  [MessageId.REP18A]: CANON_MESSAGES.REP18A,
  [MessageId.REP24A]: CANON_MESSAGES.REP24A,
  [MessageId.ADMEN2FA]: CANON_MESSAGES.ADMEN2FA,
  [MessageId.ADMEN2FB]: CANON_MESSAGES.ADMEN2FB,
  [MessageId.CANTEXT]: CANON_MESSAGES.CANTEXT,
  [MessageId.EXIWAR2]: CANON_MESSAGES.EXIWAR2,
  [MessageId.REP23]: CANON_MESSAGES.REP23,
  [MessageId.REP24]: CANON_MESSAGES.REP24,
  [MessageId.REP12]: CANON_MESSAGES.REP12,
  [MessageId.REP13]: CANON_MESSAGES.REP13,
  // rep acc — GECMDS.C:2074
  [MessageId.REP25]: CANON_MESSAGES.REP25,
  [MessageId.REP26]: CANON_MESSAGES.REP26,
  [MessageId.REP27]: CANON_MESSAGES.REP27,
  [MessageId.REP28]: CANON_MESSAGES.REP28,
  [MessageId.REP30]: CANON_MESSAGES.REP30,
  [MessageId.REP31]: CANON_MESSAGES.REP31,
  [MessageId.REP31A]: CANON_MESSAGES.REP31A,
  // scan — GECMDS.C:2138
  [MessageId.SCANFMT]: CANON_MESSAGES.SCANFMT,
  [MessageId.TABROKE]: CANON_MESSAGES.TABROKE,
  [MessageId.JAMMER4]: CANON_MESSAGES.JAMMER4,
  [MessageId.SCAN_NOT_IN_FLIGHT]: 'You must be in flight to use that scan mode.',

  // scan pl — planet status block (feature 004)
  // @see GECMDS.C:2316 (no-planet path); GECMDS.C:2326-2356 (planet status block)
  [MessageId.NO_SUCH_PLANET]: 'No planet by that name.',
  [MessageId.SCAN08]: CANON_MESSAGES.SCAN08,
  [MessageId.SCAN_DASHES]: '-----------------',
  [MessageId.SCAN09]: CANON_MESSAGES.SCAN09,
  // Sent to the ship that was just scanned. @see GECMDS.C:2261-2280
  [MessageId.SCAN1]: CANON_MESSAGES.SCAN1,
  [MessageId.SCAN2]: CANON_MESSAGES.SCAN2,
  [MessageId.SCAN3]: CANON_MESSAGES.SCAN3,
  [MessageId.SCAN10]: CANON_MESSAGES.SCAN10,
  [MessageId.SCAN11]: CANON_MESSAGES.SCAN11,
  // Worst to best, matching the index they are looked up by: production scales
  // with (enviorn + resource + 2) * 0.25 (GEPLANET.C:281), so grade 3 is the
  // best world. These read the other way round until 2026-08-31, which had
  // pilots picking the least productive planet on the board.
  [MessageId.SCAN12]: CANON_MESSAGES.SCAN12,
  [MessageId.SCAN13]: CANON_MESSAGES.SCAN13,
  [MessageId.SCAN14]: CANON_MESSAGES.SCAN14,
  [MessageId.SCAN15]: CANON_MESSAGES.SCAN15,
  [MessageId.SCAN16]: CANON_MESSAGES.SCAN16,
  [MessageId.SCAN_LOCATED_IN]: 'Located in sector (%d,%d).',

  // scan pl beacon (feature 005)
  [MessageId.SCAN_BEACON]: '%s broadcasts: "%s"',

  // orbit (feature 005) — GECMDS.C:758 cmd_orbit
  // MBMGEMSG.MSG:2840 ORBIT1 carries the plnum AND the name — the number is
  // what the player types into `sca pl <n>` and `tra`.
  [MessageId.ORBIT01]: CANON_MESSAGES.ORBIT1,
  // Canon's own words. @see GECMDS.C:791-793, GE/REL/MBMGEMSG.MSG ORBIT0
  [MessageId.ORBIT0]: CANON_MESSAGES.ORBIT0,
  [MessageId.ORBITALR]: CANON_MESSAGES.ORBIT3,
  // C's ORBIT2 — you must close to within 250 units first. @see GECMDS.C cmd_orbit
  // MBMGEMSG.MSG ORBIT2, verbatim. Canon gives no distance and we do not add
  // one: the gravity warnings are how a pilot learns the range in situ.
  [MessageId.ORBIT_TOO_FAR]: CANON_MESSAGES.ORBIT2,
  // Not in C — cmd_abandon releases the colony on the spot. Three letters
  // separated a developed colony from oblivion, with `aba`/`abo` adjacent in
  // the same command set. @see docs/DECISIONS.md
  [MessageId.ABAN_CONFIRM_PLANET]: 'Give up %s? Everything on it stays behind and anyone may claim it. Type YES to confirm.',
  [MessageId.ABAN_CONFIRM_SHIP]: 'Abandon %s? The hull is scuttled and you will need a new one. Type YES to confirm.',
  [MessageId.ABAN_CANCELLED]: 'Left as it is.',
  [MessageId.TRAN_NO_ROOM]: "%s does not have room for that.",
  // C's ADMENU2D — the pool cannot cover the amount asked for.
  [MessageId.WTHDR_TOO_MUCH]: CANON_MESSAGES.ADMENU2D,
  [MessageId.WTHDR_FMT]: 'Usage: wit [amount]  (no amount withdraws everything)',
  // Bare `pri` on a planet offering nothing. Distinct from BUY5, which is the
  // item-scoped "that item is not for sale" answer to `pri <qty> <item>`.
  [MessageId.PRICE_NONE]: 'This planet has nothing for sale.',
  [MessageId.ORBITNO]: CANON_MESSAGES.ORBIT0,
  [MessageId.ORBITPK]: 'Multiple planets — orbit which? %s',

  // land (feature 005)
  [MessageId.LAND_NOT_ORBIT]: CANON_MESSAGES.ADMIN1,
  [MessageId.LAND_NAME_PROMPT]: CANON_MESSAGES.ADMENU1A,
  [MessageId.LAND_INVALID_NAME]: 'That is not a valid planet name.',
  [MessageId.LAND_CLAIMED]: CANON_MESSAGES.ADMENU1B,
  // Per-player planet cap. @see GECMDS.C:3487 waruptr->planets >= max_plnts
  [MessageId.LAND_PLANET_LIMIT]: CANON_MESSAGES.ADMIN4,
  // Nothing in sector 0,0 is claimable — it holds the trade hub.
  [MessageId.LAND_NEUTRAL_ZONE]: 'Neutral zone planets cannot be claimed.',
  [MessageId.LAND_OK]: 'You have landed on %s.',
  [MessageId.LAND_REFUSED]: 'Landing refused — this planet is closed.',
  [MessageId.LAND_PASSFAIL]: 'Landing refused — incorrect password.',

  // buy (feature 005) — GECMDS.C:4201 cmd_buy
  [MessageId.BUYFMT]: CANON_MESSAGES.BUYFMT,
  // The gate is `where < 10`, i.e. NOT IN ORBIT — identical to C's cmd_buy
  // (GECMDS.C:4212). Orbit is sufficient; landing is not required. The previous
  // wording said "landed" and sent playtesters hunting for a landing step that
  // does not gate trade.
  [MessageId.BUY1]: CANON_MESSAGES.BUY1,
  // Four arguments are passed (qty, item, unit price, total) — the template
  // used to have three placeholders, so the total was dropped and the UNIT
  // price was reported as the amount paid.
  // BUY2 is canon's INSUFFICIENT FUNDS message, not a purchase confirmation.
  // Ours carried a duplicate of the confirmation text — which BUY9 already
  // holds, verbatim and correctly wired — and nothing referenced it, so the
  // wrong meaning sat unused behind a canon id. Restored to what canon says.
  [MessageId.BUY2]: CANON_MESSAGES.BUY2,
  // Canon names the number for sale. The port's old wording blamed the
  // planet's "reserve" — a mechanic that was zero on every neutral-zone planet
  // — and left no way to learn from inside the game that the real limit was 5.
  // @see GECMDS.C:4380-4381, MBMGEMSG.MSG:3289
  [MessageId.BUY3]: CANON_MESSAGES.BUY3,
  [MessageId.BUY4]: CANON_MESSAGES.BUY4,
  [MessageId.BUY5]: CANON_MESSAGES.BUY5,
  [MessageId.BUYPAS1]: CANON_MESSAGES.BUYPAS1,
  [MessageId.BUYPAS3]: CANON_MESSAGES.BUYPAS3,
  [MessageId.BUYPAS4]: CANON_MESSAGES.BUYPAS4,

  // multi-ship (feature 030) — ship creation/selection
  [MessageId.NEW_FLEET_FULL]: CANON_MESSAGES.NEW16,
  [MessageId.SHIP_SELECT_HEADER]: 'Choose your ship:',

  // sell (feature 005) — GECMDS.C:4103 cmd_sell
  [MessageId.SELLFMT]: CANON_MESSAGES.SELLFMT,
  [MessageId.SELL1]: CANON_MESSAGES.SELL1,
  // Canon argument order is (tax, net, quantity, item) — the port led with the
  // net and dropped the tax to a parenthetical. @see MBMGEMSG.MSG:4008
  [MessageId.SELL2]: CANON_MESSAGES.SELL2,
  // @see MBMGEMSG.MSG:4012
  [MessageId.SELL3]: CANON_MESSAGES.SELL3,
  // admin (feature 005) — GECMDS.C:3462 cmd_admin
  // Same `where < 10` orbit gate as buy — see BUY1.
  [MessageId.ADM_NOT_LANDED]: CANON_MESSAGES.ADMIN1,
  [MessageId.ADM_NOT_OWNER]: CANON_MESSAGES.ADMIN2,
  // C's ADMENU1 — `adm` on an unclaimed planet you orbit offers it to you,
  // then ADMENU1A asks for a name. @see GEMAIN.C:2899 mnu_admenu1
  [MessageId.ADM_CLAIM_OFFER]: CANON_MESSAGES.ADMENU1,
  [MessageId.ADM_CLAIM_DECLINED]: CANON_MESSAGES.ADMIN3,
  [MessageId.ADM_MENU]: CANON_MESSAGES.ADMENU2,
  [MessageId.ADM_INVALID]: 'Invalid value.',
  [MessageId.ADM_OK]: 'Setting saved.',

  // withdraw (feature 005)
  // Same `where < 10` orbit gate as buy — see BUY1.
  [MessageId.WTHDR_NOT_LANDED]: CANON_MESSAGES.ADMIN1,
  [MessageId.WTHDR_NOT_OWNER]: CANON_MESSAGES.ADMIN2,
  [MessageId.WTHDR_OK]: CANON_MESSAGES.ADMENU2C,
  [MessageId.WTHDR_NONE]: CANON_MESSAGES.ADMENU2D,

  // report cargo (feature 005)
  [MessageId.REP_CARGO_LINE]: '%6d %s',
  [MessageId.REP_CARGO_TOTAL]: 'Total: %d tons in cargo (capacity: %d tons).',
  [MessageId.REP_CARGO_NONE]: '(no items aboard)',

  // phaser (feature 006b) — GECMDS.C:cmd_phasor
  [MessageId.PHA_NOPHAS]: CANON_MESSAGES.PHASER0,
  [MessageId.PHA_NOPOW]: CANON_MESSAGES.PHANONE,
  [MessageId.PHA_FMT]: CANON_MESSAGES.PHAFMT,
  [MessageId.PHA_CLOAK]: CANON_MESSAGES.PCLOKUP,
  // MBMGEMSG.MSG:3810 ZAPHIM1, verbatim. The paraphrase dropped the Enforcer
  // Planet, which is the ONLY in-game explanation of why the neutral zone is
  // enforced at all — a new player otherwise has no idea what just shot them.
  [MessageId.WPN_ZAP]:
    'Sssssssssss.... ZAPP!!!!!\n\n'
    + 'You are instantly blinded by an intense beam from the Enforcer Planet.',
  [MessageId.HP_NOPOW]: CANON_MESSAGES.PHANONE,
  [MessageId.HP_WAIT]: CANON_MESSAGES.HPWAIT,

  // torpedo (feature 006b)
  [MessageId.TOR_NOTOR]: CANON_MESSAGES.TORP3,
  [MessageId.TOR_WARP]: CANON_MESSAGES.TORP2,
  [MessageId.TOR_CLOAK]: CANON_MESSAGES.PCLOKUP,
  [MessageId.TOR_NOAMMO]: CANON_MESSAGES.NOTORPS,
  [MessageId.TOR_FULL]: 'Target already has maximum torpedoes incoming.',
  [MessageId.TOR_FMT]: CANON_MESSAGES.NOSHIP,

  // missile (feature 006b)
  [MessageId.MIS_NOMIS]: CANON_MESSAGES.MISS01,
  [MessageId.MIS_CLOAK]: CANON_MESSAGES.PCLOKUP,
  [MessageId.MIS_NOAMMO]: CANON_MESSAGES.NOMISSL,
  [MessageId.MIS_FULL]: 'Target already has maximum missiles incoming.',
  [MessageId.MIS_FMT]: CANON_MESSAGES.MISFMT,

  // mine / zipper / decoy / jammer / sys (feature 006b Phase 5)
  // Canon has BOTH the '.' on the scan map and this warning; only the port's
  // wording was invented. The `***` banner is canon's own attention marker,
  // the same one the Cybertron taunts open with.
  [MessageId.MINE6]: CANON_MESSAGES.MINE6,
  // Canon prints the raw range and no unit: `spr("%ld",(long)range)` while
  // `range` is still in coordinate units (GECMDS.C:2516, :2673).
  // @see GE/REL/MBMGEMSG.MSG:3506-3547
  [MessageId.SCAN01]: CANON_MESSAGES.SCAN01,
  [MessageId.SCAN01A]: CANON_MESSAGES.SCAN01A,
  [MessageId.SCAN02]: CANON_MESSAGES.SCAN02,
  [MessageId.SCAN02A]: CANON_MESSAGES.SCAN02A,
  [MessageId.SCAN03]: CANON_MESSAGES.SCAN03,
  [MessageId.SCAN03A]: CANON_MESSAGES.SCAN03A,
  [MessageId.SCAN04]: CANON_MESSAGES.SCAN04,
  [MessageId.SCAN04A]: CANON_MESSAGES.SCAN04A,
  [MessageId.SCAN05]: CANON_MESSAGES.SCAN05,
  [MessageId.SCAN06]: CANON_MESSAGES.SCAN06,
  [MessageId.SCAN07]: CANON_MESSAGES.SCAN07,
  [MessageId.SCAN07A]: CANON_MESSAGES.SCAN07A,
  [MessageId.SCAN24]: CANON_MESSAGES.SCAN24,
  // The sector scan is always 1x and carries no range at all.
  [MessageId.SCAN25]: CANON_MESSAGES.SCAN25,
  [MessageId.MIN_NOMINE]: CANON_MESSAGES.MINE0,
  [MessageId.MIN_CLOAK]: CANON_MESSAGES.PCLOKUP,
  [MessageId.MIN_NEUTRAL]: CANON_MESSAGES.MINE7,
  [MessageId.MIN_NOAMMO]: CANON_MESSAGES.MINE1,
  [MessageId.MIN_FULL]: CANON_MESSAGES.MINE2,
  // Canon's answer when `laymine` finds no free slot in the galaxy-wide table
  // and returns 0 (GECMDS.C:1772-1780). Distinct from MIN_FULL, which is the
  // per-captain USRMINES cap. @see GE/REL/MBMGEMSG.MSG:5814
  [MessageId.MIN_JAMMED]: CANON_MESSAGES.MINE2,
  // Canon names the fuse, and the fuse is the whole point of the command:
  // `min <1-50>` in centocks, ~5 seconds each. Our bare "Mine deployed."
  // withheld the one number that makes the choice meaningful — a player
  // seeding an escape path could not tell a 5-second fuse from a 4-minute one.
  [MessageId.THIT1]: CANON_MESSAGES.THIT1,
  [MessageId.THIT2]: CANON_MESSAGES.THIT2,
  [MessageId.MHIT1]: CANON_MESSAGES.MHIT1,
  [MessageId.MHIT2]: CANON_MESSAGES.MHIT2,
  [MessageId.MINE4]: CANON_MESSAGES.MINE4,
  [MessageId.MIN_DEPLOYED]: CANON_MESSAGES.MINE3,
  [MessageId.ZIP_NOAMMO]: CANON_MESSAGES.ZIPPER1,
  [MessageId.ZIP_SWEPT]: CANON_MESSAGES.ZIPPER2,
  [MessageId.DEC_NOAMMO]: CANON_MESSAGES.NODECOYS,
  [MessageId.DEC_DEPLOYED]: CANON_MESSAGES.DECFIRE,
  [MessageId.JAM_NOAMMO]: CANON_MESSAGES.JAMMER1,
  [MessageId.JAM_FIRED]: CANON_MESSAGES.JAMMER2,
  [MessageId.SYS_UNJAM]: 'Jammer cleared.',
  [MessageId.SYS_UNKNOWN]: 'Unknown system command.',
  [MessageId.SYS_FMT]: 'Format: sys <command>',
  /**
   * Canon's refusal for a non-sysop reaching `sys`. Printed as a bare literal
   * rather than a .MSG entry: `prf("Huh?\r")`.
   * @see GECMDS.C:4757
   */
  [MessageId.SYS_HUH]: 'Huh?',
  /**
   * Addressed to the ship being locked, never to the firer — canon's LOCK1
   * (the firer's own confirmation) is commented out in the original.
   * `%c` is the FIRER's scan letter as the TARGET sees it: `shpltr(ship,usrn)`.
   * @see GECMDS.C:1401, :1415
   */
  [MessageId.LOCK_WARN_ACQUIRED]: CANON_MESSAGES.LOCK2,
  [MessageId.LOCK_WARN_ATTEMPT]: CANON_MESSAGES.LOCK4,
  /** @see GECMDS.C:1198, :1313 — `%c` is the firer's letter as the victim sees it. */
  [MessageId.TORP_INBOUND]: CANON_MESSAGES.TFIRE2,
  [MessageId.MISSILE_INBOUND]: CANON_MESSAGES.MFIRE2,
  /** @see GEFUNCS.C:1600, :1685 — raised once per tick while anything tracks you. */
  [MessageId.TORP_TRACKING]: CANON_MESSAGES.TORP1,
  [MessageId.MISSILE_TRACKING]: CANON_MESSAGES.MISSL1,
  /** @see GEFUNCS.C:1878-1891 — `%s` is a damstr WORD, not a number. */
  [MessageId.DESTRUCT_BLAST_DEFLECTED]: CANON_MESSAGES.SELFD6,
  [MessageId.DESTRUCT_BLAST_HIT]: CANON_MESSAGES.SELFD7,
  /**
   * @see GECMDS.C:4557 `if (neutral(&warsptr->coord) && plnum == 1)` and the
   * closing else at :4720. Zygor ONLY — unlike `mai`, which also accepts
   * Tahanian Station.
   */
  [MessageId.NEW_WRONG_PLACE]: CANON_MESSAGES.NEW5,
  /**
   * Canon's ownership refusals for `tra`. The port answered TRANSFR3 — "We are
   * not in orbit" — for both, which is false of a ship standing in orbit over
   * the planet it just tried to use. @see GECMDS.C:3348, :3411
   */
  [MessageId.TRAN_DOWN_NOT_OWNER]: CANON_MESSAGES.TRANSFR4,
  [MessageId.TRAN_UP_NOT_OWNER]: CANON_MESSAGES.TRANSUP4,
  /** @see GECMDS.C:770-774 — the first thing `orb` answers for a ship at warp. */
  [MessageId.ORBIT_HYPERSPACE]: CANON_MESSAGES.ORBIT4,
  [MessageId.TEAM_TOO_MANY]: CANON_MESSAGES.TOOMANY,
  [MessageId.HELM_WARP]: CANON_MESSAGES.WARP,
  [MessageId.HELM_NOACCEL]: CANON_MESSAGES.NOACCEL,
  /** @see GECMDS.C:1037, :1074, :1076 — damage is a damstr WORD in both directions. */
  [MessageId.HP_FIRED]: CANON_MESSAGES.HPFIRED,
  [MessageId.HP_HIT_MINE]: CANON_MESSAGES.HPHITM,
  [MessageId.HP_HIT_YOU]: CANON_MESSAGES.HPHITU,
  /**
   * Damage Control, one line per system — "something is fixed" is not
   * actionable; the pilot needs to know whether they can steer, lock, scan or
   * shoot again. @see GEFUNCS.C:1021, :1059, :1070, :1080
   */
  [MessageId.REPAIR_PHASER]: CANON_MESSAGES.PHREPR,
  [MessageId.REPAIR_TACTICAL]: CANON_MESSAGES.TAREPR,
  [MessageId.REPAIR_HELM]: CANON_MESSAGES.HLREPR,
  [MessageId.REPAIR_FIRECNTL]: CANON_MESSAGES.FCREPR,
  /** @see GEFUNCS.C:1037, :1046 — the feedback loop of the reload cadence. */
  [MessageId.PHASER_MIN_POWER]: CANON_MESSAGES.PHSRUP,
  [MessageId.PHASER_FULL_POWER]: CANON_MESSAGES.PHSRMAX,
  /** @see GEFUNCS.C:1345 SHDNNOP, :2486 SHREPR */
  [MessageId.SHIELDS_NO_POWER]: CANON_MESSAGES.SHDNNOP,
  [MessageId.SHIELDS_REPAIRED]: CANON_MESSAGES.SHREPR,
  /** @see GEFUNCS.C:1724 CLOKUP, :1392 CLREPR */
  [MessageId.CLOAK_FULL]: CANON_MESSAGES.CLOKUP,
  [MessageId.CLOAK_REPAIRED]: CANON_MESSAGES.CLREPR,
  /** @see GEFUNCS.C:422 MAINT7, :399 MAINT10 */
  [MessageId.MAINT_COMPLETE]: CANON_MESSAGES.MAINT7,
  [MessageId.MAINT_INTERRUPTED]: CANON_MESSAGES.MAINT10,
  /**
   * KILLGOT1 ends mid-sentence ("We have retrieved") on purpose — canon appends
   * the salvaged items with `prf(", %s %s")`, so the list is part of the line.
   * @see GEFUNCS.C:1120-1136, :1187
   */
  [MessageId.KILL_SALVAGE]: CANON_MESSAGES.KILLGOT1,
  [MessageId.KILL_POINTS]: CANON_MESSAGES.KILLPNTS,

  // lock (feature 006b Phase 6) — GECMDS.C:1441 cmd_lock
  [MessageId.LOC_SELF]: CANON_MESSAGES.FOOLISH,
  [MessageId.LOC_NOTFOUND]: CANON_MESSAGES.NOSHIP,
  [MessageId.LOC_LOCKED]: CANON_MESSAGES.LOCK02,
  [MessageId.LOC_FMT]: CANON_MESSAGES.NOSHIP,
  [MessageId.NOLOCK]: CANON_MESSAGES.NOLOCK,

  // shield (feature 006b Phase 6) — GECMDS.C cmd_shield
  [MessageId.SHI_UP]: CANON_MESSAGES.SHLDCHP,
  [MessageId.SHI_DN]: 'Shields down.',
  [MessageId.SHI_FMT]: CANON_MESSAGES.SHLDFMT,
  // cmd_shields gates, GECMDS.C:3114-3170
  [MessageId.SHIELD0]: CANON_MESSAGES.SHIELD0,
  [MessageId.SHLD1]: CANON_MESSAGES.SHLD1,
  [MessageId.SHLD2]: CANON_MESSAGES.SHLD2,
  [MessageId.SHNOPWR]: CANON_MESSAGES.SHNOPWR,
  [MessageId.SHNORPR]: CANON_MESSAGES.SHNORPR,

  // flux (feature 006b Phase 6) — GECMDS.C:735-752 cmd_flux
  [MessageId.FLUX_NOPODS]: CANON_MESSAGES.NOFLUX,
  [MessageId.FLUX_USED]: CANON_MESSAGES.FLUXLOAD,
  [MessageId.FLUX_FMT]: 'Format: flux',
  /** @see GECMDS.C:748 LASTFLUX — warn when the pod just used was the last one. */
  [MessageId.FLUX_LAST]: CANON_MESSAGES.LASTFLUX,

  // who (feature 012) — GECMDS.C:5162 cmd_who reinterpreted
  [MessageId.WHO_HEADER]: '  Shipname               Class                Sector  Kills',
  [MessageId.WHO_ROW]: ' %s %s (%2s,%2s)  %5s',

  // dat (feature 012) — GECMDS.C:5829 cmd_data reinterpreted
  [MessageId.DAT_HEADER]: 'Ship: %s (#%d)',
  [MessageId.DAT_LINE]: '%s',
  [MessageId.DAT_NOT_FOUND]: 'Ship not found.',

  // ros (feature 012) — GECMDS.C:5276 cmd_geroster
  [MessageId.ROS_HEADER]: CANON_MESSAGES.ROSTER2,
  [MessageId.ROS_ROW]: '%-30s%11s%5d%3d%s', // GECMDS.C:4045 prf — canon's row, inline in the C rather than the MSG file

  // sen (feature 012) — GECMDS.C:1825 cmd_send
  [MessageId.MSG_USAGE_SEN]: CANON_MESSAGES.SNDFMT,
  [MessageId.MSG_SENT]: CANON_MESSAGES.MSGSNT2,
  [MessageId.MSG_SENT_SECTOR]: CANON_MESSAGES.MSGSNT4,
  [MessageId.MSG_SENT_HYPER]: CANON_MESSAGES.MSGSNT6,
  [MessageId.MSG_BADCOM]: CANON_MESSAGES.BADCOM,
  [MessageId.FRE_BADFREQ]: CANON_MESSAGES.FREQFMT,
  [MessageId.FRE_HAIL]: CANON_MESSAGES.RADSET1,
  [MessageId.FRE_SECTOR]: CANON_MESSAGES.RADSET2,
  [MessageId.FRE_GALAXY]: CANON_MESSAGES.RADSET3,

  // fre (feature 012) — GECMDS.C:1885 cmd_freq
  [MessageId.MSG_USAGE_FRE]: CANON_MESSAGES.SETFMT,

  // tea (feature 012) — GECMDS.C:5277 cmd_team (subset)
  [MessageId.TEAM_NONE]: CANON_MESSAGES.TEAMNOT,
  [MessageId.TEAM_CURRENT]: 'You are on team %s.',
  [MessageId.TEAM_LEFT]: CANON_MESSAGES.TEAMUNJN,
  [MessageId.TEAM_JOINED]: CANON_MESSAGES.TEAMJOIN,
  [MessageId.TEAM_NOT_FOUND]: CANON_MESSAGES.TEAMBAD,

  // cloak (feature 013) — GECMDS.C:3188 cmd_cloak
  [MessageId.CLOAK_ENGAGED]: CANON_MESSAGES.CLOKON,
  [MessageId.CLOAK_ALREADY_ON]: CANON_MESSAGES.CLOKCOM,
  [MessageId.CLOAK_NO_ENERGY]: CANON_MESSAGES.CLOKPWR,
  [MessageId.CLOAK_DAMAGED]: CANON_MESSAGES.CLOKDAM,
  [MessageId.CLOAK_HYPERSPACE]: CANON_MESSAGES.CLOK1,
  [MessageId.CLOAK_DISENGAGED]: CANON_MESSAGES.CLOKOFF,
  [MessageId.CLOAK_ALREADY_OFF]: CANON_MESSAGES.CLOKDWN,
  [MessageId.CLOAK_FMT]: CANON_MESSAGES.CLOFMT,
  [MessageId.CLOAK_SECTOR_DECLOAKED]: CANON_MESSAGES.CLOK2,
  [MessageId.CLOAK_COLLAPSED]: CANON_MESSAGES.CLOKNOP,

  // maint (feature 013) — GECMDS.C:4452 cmd_maint
  [MessageId.MAINT_NOT_ORBIT]: CANON_MESSAGES.MAINT1,
  [MessageId.MAINT_NO_FACILITY]: CANON_MESSAGES.MAINT8,
  [MessageId.MAINT_COMBAT]: CANON_MESSAGES.MAINT9,
  [MessageId.MAINT_NZ]: CANON_MESSAGES.MAINT4,
  [MessageId.MAINT_NO_CASH]: CANON_MESSAGES.MAINT6,
  [MessageId.MAINT_OK]: CANON_MESSAGES.MAINT5,

  // transfer (feature 013) — GECMDS.C:3271 cmd_transfer reinterpreted
  [MessageId.TRAN_SELF]: 'Cannot transfer to your own ship.',
  [MessageId.TRAN_OFFLINE]: 'Target ship not online.',
  [MessageId.TRAN_SECTOR]: 'Target ship not in this sector.',
  [MessageId.TRAN_NO_CARGO]: CANON_MESSAGES.TRANSFR1,
  [MessageId.TRAN_NO_GOLD]: 'Insufficient gold.',
  [MessageId.TRAN_UNKNOWN_ITEM]: CANON_MESSAGES.TRANSFR2,
  [MessageId.TRAN_OK]: 'Transferred %d %s to %s.',
  [MessageId.TRAN_RECEIVED]: '%s transferred %d %s to you.',
  [MessageId.TRAN_FMT]: CANON_MESSAGES.TRANSFMT,
  [MessageId.TRAN_NOT_ORBIT]: CANON_MESSAGES.TRANSFR3,
  [MessageId.TRAN_NOT_OWNER]: CANON_MESSAGES.TRANSFR3,
  [MessageId.TRAN_PLANET_LOW]: CANON_MESSAGES.TRANSUP1,
  [MessageId.TRAN_DOWN_OK]: CANON_MESSAGES.TRANSFR5,
  [MessageId.TRAN_UP_OK]: CANON_MESSAGES.TRANSUP5,

  // jettison (feature 013) — GECMDS.C:6102 cmd_jettison
  [MessageId.JET_NO_CARGO]: CANON_MESSAGES.JETT1,
  [MessageId.JET_OK]: CANON_MESSAGES.JETT3,
  [MessageId.JET_FMT]: CANON_MESSAGES.JETTFMT,

  // set (feature 013/015) — GECMDS.C:5190 cmd_set reinterpreted
  [MessageId.SET_OK_ON]: 'Option %s set ON.',
  [MessageId.SET_OK_OFF]: 'Option %s set OFF.',
  [MessageId.SET_UNKNOWN]: 'Unknown option. Usage: set <auto-shield|auto-repair|scannames|scanhome> <on|off>',
  [MessageId.SET_STATUS]: '%s',
  [MessageId.SET_FMT]: CANON_MESSAGES.SETFMT,

  // destruct (feature 013) — GECMDS.C:5025 cmd_destruct
  [MessageId.DESTRUCT_NZ]: CANON_MESSAGES.SELFD1A,
  [MessageId.DESTRUCT_START]: CANON_MESSAGES.SELFD1,
  [MessageId.DESTRUCT_TICK]: CANON_MESSAGES.SELFD2,
  [MessageId.DESTRUCT_TICK_10]: CANON_MESSAGES.SELFD2A,
  [MessageId.DESTRUCT_TICK_5]: CANON_MESSAGES.SELFD2B,
  [MessageId.DESTRUCT_TICK_2]: CANON_MESSAGES.SELFD2C,
  [MessageId.DESTRUCT_BOOM]: CANON_MESSAGES.SELFD3,
  [MessageId.DESTRUCT_BOOM_SECTOR]: CANON_MESSAGES.SELFD3A,

  // abort (feature 013) — GECMDS.C:5044 cmd_abort
  [MessageId.ABORT_OK]: CANON_MESSAGES.SELFD4,
  [MessageId.ABORT_NONE]: CANON_MESSAGES.SELFD5,
  [MessageId.ABORT_SECTOR]: CANON_MESSAGES.SELFD4A,

  // abandon (feature 013) — GECMDS.C:3420 cmd_abandon reinterpreted
  [MessageId.ABANDON_OK]: 'You have abandoned ship %s.',
  [MessageId.ABANDON_SECTOR]: '%s has been abandoned by its captain.',
  [MessageId.ABANDON_NO_SHIP]: 'You have no active ship. Please create one.',
  // canonical `aba` — colony abandonment (GECMDS.C:3420)
  [MessageId.ABAN01]: CANON_MESSAGES.ABAN01,
  [MessageId.ABAN02]: CANON_MESSAGES.ABAN02,
  [MessageId.ABAN03]: CANON_MESSAGES.ABAN03,

  // nav (feature 016) — GECMDS.C:5120 cmd_navigate
  [MessageId.NAVFMT]: CANON_MESSAGES.NAVFMT,
  // C's cmd_navigate only reports bearing and distance; this port also turns the
  // ship. Neither sets speed, and saying so matters: pilots engaged "autopilot"
  // and sat still waiting to arrive.
  // Canon's text, verbatim. It sets no course and does not mention speed,
  // because cmd_navigate is a read-only bearing report — the autopilot the old
  // wording described was a port invention and has been withdrawn.
  // @see GECMDS.C:5154, GE/REL/MBMGEMSG.MSG NAV01
  [MessageId.NAV01]: CANON_MESSAGES.NAV01,
  [MessageId.LEAVEORB]: CANON_MESSAGES.LEAVEORB,
  [MessageId.SHLDCHP]: CANON_MESSAGES.SHLDCHP,
  [MessageId.SHLDUP]: CANON_MESSAGES.SHLDUP,
  [MessageId.SHLDAT]: CANON_MESSAGES.SHLDAT,
  [MessageId.SHLDDN]: CANON_MESSAGES.SHLDDN,
  // Canon combat narration. Note the asymmetry, which is canon's own: a hull
  // hit reports damage as a WORD via damstr (%s), while a DEFLECTED hit
  // reports a numeric magnitude (%d). Without these the shooter was never told
  // whether a beam was deflected or simply missed — which is what made three
  // separate playtesters conclude phasers were broken.
  [MessageId.PFIRED]: CANON_MESSAGES.PFIRED,
  [MessageId.PHITHIM]: CANON_MESSAGES.PHITHIM,
  [MessageId.PHITYOU]: CANON_MESSAGES.PHITYOU,
  [MessageId.PDEFLECT]: CANON_MESSAGES.PDEFLECT,
  [MessageId.PHITDEF]: CANON_MESSAGES.PHITDEF,
  [MessageId.YOURDEAD]:
    CANON_MESSAGES.YOURDEAD
    + 'Damage control reports severe structural damage in critical systems!\n\n'
    + 'Your private shuttle is waiting Sir!\n\n'
    + 'You escape safely and are picked up by a Galactic Command Freighter\n'
    + 'and transported back to their next stop, Zygor!',

  // spy (feature 016) — GECMDS.C cmd_spy
  [MessageId.SPY1]: CANON_MESSAGES.SPY1,
  [MessageId.SPY0]: CANON_MESSAGES.SPY0,
  [MessageId.SPY0B]: CANON_MESSAGES.SPY0B,
  [MessageId.SPY0C]: CANON_MESSAGES.SPY0C,
  [MessageId.SPYM0]: CANON_MESSAGES.SPYM0,
  [MessageId.SPYM1]: CANON_MESSAGES.SPYM1,

  // hel (feature 016) — GECMDS.C cmd_help
  // Topic list is passed in from HELP_TOPIC_IDS — hardcoding it here meant a
  // new topic was reachable but never advertised.
  [MessageId.HELFMT]: "Available help topics: %s. Try 'hel <topic>'.",
  [MessageId.HEL_UNKNOWN]: "Unknown help topic '%s'. Valid topics: %s.",

  // att (feature 014) — GECMDS.C:3515 cmd_attack
  [MessageId.ATT_NOT_ORBIT]: CANON_MESSAGES.ATTACK1,
  [MessageId.ATT_NO_CAPABILITY]: CANON_MESSAGES.ATTACK0A,
  [MessageId.ATT_WORMHOLE]: CANON_MESSAGES.ATTACK0B,
  [MessageId.ATT_SELF]: CANON_MESSAGES.ATTACK0,
  [MessageId.ATT_FORMAT]: CANON_MESSAGES.ATTFMT,
  [MessageId.ATT_NO_TROOPS]: CANON_MESSAGES.ATTACKM0,
  [MessageId.ATT_NO_FIGHTERS]: CANON_MESSAGES.ATTACKF0,
  [MessageId.ATT_LOSS_REPORT]: CANON_MESSAGES.ATTACKM2,
  [MessageId.ATT_WIN_TROOP]: CANON_MESSAGES.ATTACKM3,
  [MessageId.ATT_WIN_FIGHTER]: CANON_MESSAGES.ATTACKF7,
  [MessageId.ATT_RETREAT]: CANON_MESSAGES.ATTACKM4,
  [MessageId.ATT_TROOP_LAUNCH]: CANON_MESSAGES.ATTACKM1,
  [MessageId.ATT_FIG_LAUNCH]: CANON_MESSAGES.ATTACKF1,
  [MessageId.ATT_TROOP_COUNTER]: CANON_MESSAGES.ATTACKM7,
  [MessageId.ATT_TROOP_COUNTER_KILL]: CANON_MESSAGES.ATTACKM8,
  [MessageId.ATT_FIG_LOSS_REPORT]: CANON_MESSAGES.ATTACKF2,
  [MessageId.ATT_FIG_ITEM_DESTROYED]: CANON_MESSAGES.ATTACKF5,
  [MessageId.ATT_FIG_RESOLVED]: CANON_MESSAGES.ATTACKF6,
  [MessageId.ATT_WON]: CANON_MESSAGES.ATTACK8,
  [MessageId.ATT_STANDOFF]: CANON_MESSAGES.ATTACK9,
  [MessageId.ATT_ITEM_DESTROYED]: CANON_MESSAGES.ATTACKM5,
  [MessageId.ATT_RESOLVED]: CANON_MESSAGES.ATTACKM6,
  [MessageId.ATT_OWNER_ALERT]: CANON_MESSAGES.ATTACK6,
  [MessageId.ATT_GROUND_AA]: CANON_MESSAGES.ATTACKF8,

  // pln (feature 014) — GECMDS.C cmd_pln
  [MessageId.PLN_HEADER]: CANON_MESSAGES.PLAMSG1,
  [MessageId.PLN_NONE]: CANON_MESSAGES.PLAMSG2,
  [MessageId.PLN_ROW]: '%-20s %5d %5d  %d ', // GECMDS.C:cmd_planet prf — canon's row, inline in the C rather than the MSG file

  // pri (feature 014) — GECMDS.C:4284 cmd_price
  [MessageId.PRICEFMT]: CANON_MESSAGES.PRICEFMT,
  // @see MBMGEMSG.MSG:3313
  [MessageId.PRICE1]: CANON_MESSAGES.PRICE1,
  [MessageId.PRICE_NO_CASH]: 'Insufficient credits to purchase that quantity.',
  [MessageId.BUY7]: CANON_MESSAGES.BUY7,
  // @see MBMGEMSG.MSG:3305
  [MessageId.BUY8]: CANON_MESSAGES.BUY8,
  // @see MBMGEMSG.MSG:3309
  [MessageId.BUY9]: CANON_MESSAGES.BUY9,

  // Canon names the killer on every death path — the prfmsg sits AFTER the
  // GESTAT_AUTO branch, so an AI kill is announced exactly like a player one.
  // @see GEFUNCS.C:1116, MBMGEMSG.MSG:2122
  [MessageId.KILLEDBY]: CANON_MESSAGES.KILLEDBY,
  // Helm answers the throttle. @see MBMGEMSG.MSG:2120, :1960
  // The second slot is %s, not canon's %d, so the hundredths keep their
  // leading zero -- "warp 9 point 05", not "warp 9 point 5". Canon's own two
  // %d slots are fed showarp(), which returns a STRING ("9.05"): a varargs bug
  // that printed garbage in the shipped game.
  [MessageId.SPEEDIS]: CANON_MESSAGES.SPEEDIS,
  [MessageId.SPEED0]: CANON_MESSAGES.SPEED0,
  // @see GE/REL/MBMGEMSG.MSG:2630
  [MessageId.MISSL2]: CANON_MESSAGES.MISSL2,

  // Shipyard narration. Canon quotes the trade-in FIRST (NEW19/NEW29) and then
  // the Yardmaster's fitting report, which is what makes an upgrade priced at
  // 36,666 rather than 40,000 legible to the player.
  // @see GECMDS.C:4606,4640,4668,4701; MBMGEMSG.MSG:3946,3960,3982,3986,3990,3996,4001
  [MessageId.NEW19]: CANON_MESSAGES.NEW19,
  [MessageId.NEW7]:
    CANON_MESSAGES.NEW7
    + 'The Yardmaster Reports: For the meager sum of %s\n'
    + 'your ship now has a Mark-%d Shield defense system.',
  [MessageId.NEW29]: CANON_MESSAGES.NEW29,
  [MessageId.NEW10]:
    CANON_MESSAGES.NEW10
    + 'The Yardmaster Reports: For the meager sum of %s\n'
    + 'your ship now has a Mark-%d Phaser System.',
  [MessageId.NEW17]: CANON_MESSAGES.NEW17,
  [MessageId.NEW18]:
    CANON_MESSAGES.NEW18
    + "fee of %s C's %s has been deposited to your account, Sir.",
  [MessageId.NEW28]:
    CANON_MESSAGES.NEW28
    + "fee of %s C's %s has been deposited to your account, Sir.",

  // maint password gate (feature 014) — GECMDS.C:4471 MAINT2, :4479 MAINT3
  [MessageId.MAINT2]: CANON_MESSAGES.MAINT2,
  [MessageId.MAINT3]: CANON_MESSAGES.MAINT3,

  // distress mail types (feature 014) — research.md D3
  [MessageId.MESG02]: CANON_MESSAGES.MESG02,
  [MessageId.MESG03]: CANON_MESSAGES.MESG03,
  [MessageId.MESG04]: CANON_MESSAGES.MESG04,
  [MessageId.MESG05]: CANON_MESSAGES.MESG05,

  // torpedo / missile lock-quality gates (feature 023) — GECMDS.C:1363-1395
  [MessageId.LOCK_FAIL]: CANON_MESSAGES.LOCK3,
  [MessageId.LOCK_UNREACHABLE]: CANON_MESSAGES.LOCK5,
  [MessageId.LOCK_NEUTRAL]: CANON_MESSAGES.FCNONO,
  // fire control damaged gate — GECMDS.C:1346-1351 lockon
  [MessageId.FCBROKE]: CANON_MESSAGES.FCBROKE,

  // shared
  [MessageId.HLBROKE]: CANON_MESSAGES.HLBROKE,
  // MBMGEMSG.MSG:2090 NUMOOR, verbatim. The paraphrase rendered a negative
  // lower bound as "(-180-180)", which reads as a single negative number.
  [MessageId.NUMOOR]: CANON_MESSAGES.NUMOOR,
  [MessageId.UNKNOWN_CMD]: CANON_MESSAGES.INVCMD,
  // Blank line — GECMDS.C:282-284 warnop()
  [MessageId.FORHELP]: CANON_MESSAGES.FORHELP,
  [MessageId.SHIP_ABANDONED]: 'Your ship has been abandoned. Please create a new ship.',
};

/**
 * Formats a message by replacing printf-style placeholders (%s, %d, %u, %.1f) in order.
 *
 * @param id    The message identifier.
 * @param args  Replacement values in left-to-right placeholder order.
 */
/**
 * Canon's own wording, for every message where the port had invented its own.
 *
 * A sweep of MBMGEMSG.MSG found only 26 of our 325 strings matching canon and
 * 108 differing — systematically, with canon's in-world voice flattened into
 * modern UI text:
 *
 *   canon: "Warp Drive? On this tub? Sorry Sir!"
 *   ours : "Your ship has no warp drive."
 *   canon: "Sir, we cannot rotate while we are moving!!"
 *   ours : "Cannot rotate while reversing."
 *
 * The voice is not decoration; it is most of what the game feels like, and it
 * was replaced one convenience at a time. The 93 whose printf arity already
 * matched now read straight from the generated table, so they cannot drift
 * again. The remaining 15 differ in argument COUNT and need their call sites
 * looked at individually — they are listed in docs/PROGRESS.md.
 *
 * @see tools/extract-messages.mjs
 * @see test/balance/message-canon.balance.spec.ts
 */
/**
 * Canon's printf specifiers, substituted positionally.
 *
 * The conversion set is C's, because the strings are C's. Two omissions here
 * were silently mangling canon text that had been wired correctly:
 *
 *   %c  was not recognised at all, so it survived into the output verbatim.
 *       Canon uses it for the SHIP LETTER — LOCK3/LOCK5 when fire control
 *       cannot hold a target, PHITDEF when your shields turn a phaser, and all
 *       three RADSET confirmations. Every one of those printed a literal "%c"
 *       where the letter belonged.
 *   Width and the `-` flag were parsed but discarded, so `%-11s` and `%5u` lost
 *       their padding. Those exist to line up columns: ADMIN03 is a planet
 *       accounting table and ROS_ROW is the roster. Dropping the width turned
 *       both into ragged text.
 *
 * Length modifiers (l, ll, h, hh) are accepted and ignored, which is right —
 * they describe the C argument's storage, and JavaScript has one number type.
 */
export function formatMessage(id: MessageId, ...args: Array<string | number>): string {
  let argIdx = 0;
  return MESSAGE_STRINGS[id].replace(
    /%%|%([-+ 0#]*)(\d+)?(?:\.(\d+))?(?:hh|h|ll|l)?([sduxXfc])/g,
    (whole, flags: string, width: string | undefined, precision: string | undefined, conv: string) => {
      if (whole === '%%') return '%';

      const val = args[argIdx++];
      if (val === undefined) return '';

      let text: string;
      switch (conv) {
        case 'c':
          // A char in C. Take the first character of whatever was passed, so a
          // caller may hand over either a letter or a one-letter string.
          text = String(val).charAt(0);
          break;
        case 'x':
        case 'X': {
          const hex = Math.trunc(Number(val)).toString(16);
          text = conv === 'X' ? hex.toUpperCase() : hex;
          break;
        }
        case 'f':
          text = precision !== undefined ? Number(val).toFixed(Number(precision)) : String(val);
          break;
        default:
          text = String(val);
      }

      const w = width === undefined ? 0 : Number(width);
      if (text.length >= w) return text;
      // `-` left-justifies; `0` zero-pads, but never a left-justified field
      // and never a string, exactly as printf has it.
      if (flags.includes('-')) return text.padEnd(w);
      const pad = flags.includes('0') && conv !== 's' && conv !== 'c' ? '0' : ' ';
      return text.padStart(w, pad);
    },
  );
}
