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
  ORBITPK = 'ORBITPK',

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
  MAINT_NO_DAMAGE = 'MAINT_NO_DAMAGE',
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
  DESTRUCT_ACTIVE = 'DESTRUCT_ACTIVE',
  DESTRUCT_START = 'DESTRUCT_START',
  DESTRUCT_SECTOR_START = 'DESTRUCT_SECTOR_START',
  DESTRUCT_TICK = 'DESTRUCT_TICK',
  DESTRUCT_TICK_10 = 'DESTRUCT_TICK_10',
  DESTRUCT_TICK_5 = 'DESTRUCT_TICK_5',
  DESTRUCT_TICK_2 = 'DESTRUCT_TICK_2',
  DESTRUCT_BOOM = 'DESTRUCT_BOOM',

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
  NAV_INACTIVE = 'NAV_INACTIVE',
  NAV_STATUS = 'NAV_STATUS',
  NAV_ARRIVED = 'NAV_ARRIVED',
  NAV_ALREADY_THERE = 'NAV_ALREADY_THERE',

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
  ATT_DEFENDER_FIGHTER_KILL = 'ATT_DEFENDER_FIGHTER_KILL',
  ATT_GROUND_TROOP_KILL = 'ATT_GROUND_TROOP_KILL',
  ATT_ATTACKER_COUNTER_KILL = 'ATT_ATTACKER_COUNTER_KILL',
  ATT_LOSS_REPORT = 'ATT_LOSS_REPORT',
  ATT_WIN_TROOP = 'ATT_WIN_TROOP',
  ATT_WIN_FIGHTER = 'ATT_WIN_FIGHTER',
  ATT_RETREAT = 'ATT_RETREAT',
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
  [MessageId.IMPFMT]: 'Usage: impulse <0-99> [course]',
  [MessageId.IMPULSE1]: 'You cannot use impulse engines in hyperspace.',
  [MessageId.ENGFIRE]: 'Engines fired, new course %u degrees.',
  [MessageId.ENGSTOP]: 'Engines cut. Coasting to a stop.',

  // warp — GECMDS.C:561
  [MessageId.WARP01]: 'Your ship has no warp drive.',
  [MessageId.WARPSPD2]: 'Your warp drive is offline.',
  [MessageId.WARPFMT]: 'Usage: warp <speed> [course]',
  [MessageId.WARP02]: 'Speed cannot be negative.',
  [MessageId.WARP03]: 'Speed exceeds maximum allowed by 50%.',
  [MessageId.WARP04]: 'Warning: speed exceeds rated maximum of warp %d.',

  // rotate — GECMDS.C:643
  [MessageId.ROTFMT]: 'Usage: rotate <-180..180>',
  [MessageId.NOWTURN]: 'Now turning to %u degrees.',
  [MessageId.NOROTPW]: 'Insufficient power to rotate.',
  [MessageId.CANTROT]: 'Cannot rotate while reversing.',

  // report — GECMDS.C:1946
  [MessageId.REPFMT]: 'Usage: report <nav|sys|inv|cargo|wpns|acc>',
  [MessageId.REP01]: '%s — %s',
  [MessageId.DASHES]: '--------------------------------',
  [MessageId.REP35]: 'Navigation:',
  [MessageId.REP02]: 'In hyperspace at sector (%d, %d).',
  [MessageId.REP03]: 'Speed: %s',
  [MessageId.REP04]: 'Heading: %d degrees.',
  [MessageId.REP05]: 'In sector (%d, %d).',
  [MessageId.REP06]: 'Speed: %s',
  [MessageId.REP07]: 'Heading: %d degrees.',
  [MessageId.REP08]: 'Orbiting planet %d in sector (%d, %d).',
  [MessageId.REP32]: 'Position: sector (%d, %d) intra (%d, %d).',
  [MessageId.REP09]: 'Energy: %u units.',
  [MessageId.REP10]: 'Shields: %s at %d%%.',
  [MessageId.REP11]: 'Shields: down.',
  [MessageId.REP11B]: 'Shields: destroyed.',
  [MessageId.REP14]: 'Damage: %s',
  // rep sys subsystem lines — GECMDS.C:2041-2050
  [MessageId.REP15]: 'Shields are damaged and cannot be raised.',
  [MessageId.REP16]: 'Helm control is damaged.',
  [MessageId.REP17]: 'Cloaking device is damaged.',
  [MessageId.REP18]: 'Tactical systems are damaged.',
  [MessageId.REP18A]: 'Repairs in progress — %d ticks remaining.',
  [MessageId.REP24A]: 'Frequencies: %d / %d / %d.',
  [MessageId.REP23]: 'Phasors: %s.',
  [MessageId.REP24]: 'Phasors: none.',
  [MessageId.REP12]: 'Cloak: active.',
  [MessageId.REP13]: 'Cloak: inactive.',
  // rep acc — GECMDS.C:2074
  [MessageId.REP25]: 'Account:',
  [MessageId.REP26]: 'Planets: none.',
  [MessageId.REP27]: 'Planets owned: %d.',
  [MessageId.REP28]: 'Credits: %s',
  [MessageId.REP30]: 'Score: %s',
  [MessageId.REP31]: 'Kills: %d.',
  [MessageId.REP31A]: 'Team: %s',

  // scan — GECMDS.C:2138
  [MessageId.SCANFMT]: 'Usage: scan <mode>  (sh/pl/ra/se/lo)',
  [MessageId.TABROKE]: 'Tactical computer is offline.',
  [MessageId.JAMMER4]: 'Cannot scan while jammer is active.',
  [MessageId.SCAN_NOT_IN_FLIGHT]: 'You must be in flight to use that scan mode.',

  // scan pl — planet status block (feature 004)
  // @see GECMDS.C:2316 (no-planet path); GECMDS.C:2326-2356 (planet status block)
  [MessageId.NO_SUCH_PLANET]: 'No planet by that name.',
  [MessageId.SCAN08]: 'Planet #%d: %s',
  [MessageId.SCAN_DASHES]: '-----------------',
  [MessageId.SCAN09]: 'Owned by: %s',
  // Sent to the ship that was just scanned. @see GECMDS.C:2261-2280
  [MessageId.SCAN1]: 'You are being scanned by %s.',
  [MessageId.SCAN2]: 'Your ship is being scanned from bearing %d, beyond your own scanners.',
  [MessageId.SCAN3]: 'An unidentified vessel is scanning you from bearing %d.',
  [MessageId.SCAN10]: 'Bearing: %d   Distance: %s',
  [MessageId.SCAN11]: 'Environment: ',
  // Worst to best, matching the index they are looked up by: production scales
  // with (enviorn + resource + 2) * 0.25 (GEPLANET.C:281), so grade 3 is the
  // best world. These read the other way round until 2026-08-31, which had
  // pilots picking the least productive planet on the board.
  [MessageId.SCAN12]: 'Inferno-like',
  [MessageId.SCAN13]: 'Toxic',
  [MessageId.SCAN14]: 'Hostile',
  [MessageId.SCAN15]: 'Earth-like',
  [MessageId.SCAN16]: 'Resources: ',
  [MessageId.SCAN_LOCATED_IN]: 'Located in sector (%d,%d).',

  // scan pl beacon (feature 005)
  [MessageId.SCAN_BEACON]: '%s broadcasts: "%s"',

  // orbit (feature 005) — GECMDS.C:758 cmd_orbit
  [MessageId.ORBIT01]: 'Now in orbit around %s.',
  [MessageId.ORBITALR]: 'You are already in orbit.',
  [MessageId.ORBITNO]: 'There is nothing to orbit here.',
  [MessageId.ORBITPK]: 'Multiple planets — orbit which? %s',

  // land (feature 005)
  [MessageId.LAND_NOT_ORBIT]: 'You must enter orbit first.',
  [MessageId.LAND_NAME_PROMPT]: 'What would you like to name this planet? (Up to 19 characters.)',
  [MessageId.LAND_INVALID_NAME]: 'That is not a valid planet name.',
  [MessageId.LAND_CLAIMED]: 'You have claimed %s. It is now your planet.',
  // Per-player planet cap. @see GECMDS.C:3487 waruptr->planets >= max_plnts
  [MessageId.LAND_PLANET_LIMIT]: 'You already hold the maximum of %s planets.',
  // Nothing in sector 0,0 is claimable — it holds the trade hub.
  [MessageId.LAND_NEUTRAL_ZONE]: 'Neutral zone planets cannot be claimed.',
  [MessageId.LAND_OK]: 'You have landed on %s.',
  [MessageId.LAND_REFUSED]: 'Landing refused — this planet is closed.',
  [MessageId.LAND_PASSFAIL]: 'Landing refused — incorrect password.',

  // buy (feature 005) — GECMDS.C:4201 cmd_buy
  [MessageId.BUYFMT]: 'Use: buy <quantity> <item>',
  // The gate is `where < 10`, i.e. NOT IN ORBIT — identical to C's cmd_buy
  // (GECMDS.C:4212). Orbit is sufficient; landing is not required. The previous
  // wording said "landed" and sent playtesters hunting for a landing step that
  // does not gate trade.
  [MessageId.BUY1]: 'You must be in orbit around a planet to buy goods.',
  // Four arguments are passed (qty, item, unit price, total) — the template
  // used to have three placeholders, so the total was dropped and the UNIT
  // price was reported as the amount paid.
  [MessageId.BUY2]: '%d %s purchased at %d cr each — %d credits.',
  [MessageId.BUY3]: "That would deplete the planet's reserve.",
  [MessageId.BUY4]: 'Your cargo holds are full.',
  [MessageId.BUY5]: 'This planet is not selling that item.',
  [MessageId.BUYPAS1]: 'Trade password required.',
  [MessageId.BUYPAS3]: 'This planet trades only with its team.',
  [MessageId.BUYPAS4]: 'Welcome, fellow team-mate.',

  // multi-ship (feature 030) — ship creation/selection
  [MessageId.NEW_FLEET_FULL]: 'Your fleet is full — you cannot own more ships.',
  [MessageId.SHIP_SELECT_HEADER]: 'Choose your ship:',

  // sell (feature 005) — GECMDS.C:4103 cmd_sell
  [MessageId.SELLFMT]: 'Use: sell <quantity> <item>',
  [MessageId.SELL1]: 'You can only sell at the galactic market on Zygor-3.',
  [MessageId.SELL2]: 'Sold %d %s for %d credits (fee %d).',
  [MessageId.SELL3]: "You don't have that many %s.",

  // admin (feature 005) — GECMDS.C:3462 cmd_admin
  // Same `where < 10` orbit gate as buy — see BUY1.
  [MessageId.ADM_NOT_LANDED]: 'You must be in orbit around your planet to administer it.',
  [MessageId.ADM_NOT_OWNER]: 'You are not the owner of this planet.',
  [MessageId.ADM_MENU]: 'Admin options: rate, markup, sellflag, reserve, tax, beacon, password',
  [MessageId.ADM_INVALID]: 'Invalid value.',
  [MessageId.ADM_OK]: 'Setting saved.',

  // withdraw (feature 005)
  // Same `where < 10` orbit gate as buy — see BUY1.
  [MessageId.WTHDR_NOT_LANDED]: 'You must be in orbit around your planet to withdraw taxes.',
  [MessageId.WTHDR_NOT_OWNER]: 'You are not the owner of this planet.',
  [MessageId.WTHDR_OK]: 'Withdrew %d credits from planet tax pool.',
  [MessageId.WTHDR_NONE]: 'There are no taxes to withdraw.',

  // report cargo (feature 005)
  [MessageId.REP_CARGO_LINE]: '%6d %s',
  [MessageId.REP_CARGO_TOTAL]: 'Total: %d tons in cargo (capacity: %d tons).',
  [MessageId.REP_CARGO_NONE]: '(no items aboard)',

  // phaser (feature 006b) — GECMDS.C:cmd_phasor
  [MessageId.PHA_NOPHAS]: 'No phaser class mounted.',
  [MessageId.PHA_NOPOW]: 'Insufficient phaser charge.',
  [MessageId.PHA_FMT]: 'Format: pha <degree -180..180> [focus 0-5]',
  [MessageId.PHA_CLOAK]: 'Cannot fire while cloaked.',
  [MessageId.WPN_ZAP]: 'You fired inside the neutral zone! Your own weapons backfire!',
  [MessageId.HP_NOPOW]: 'Insufficient flux energy for hyper-phaser.',
  [MessageId.HP_WAIT]: 'Hyper-phaser recharging — stand by.',

  // torpedo (feature 006b)
  [MessageId.TOR_NOTOR]: 'No torpedo launcher mounted.',
  [MessageId.TOR_WARP]: 'Cannot fire torpedoes at warp speed.',
  [MessageId.TOR_CLOAK]: 'Cannot fire while cloaked.',
  [MessageId.TOR_NOAMMO]: 'No torpedoes in cargo.',
  [MessageId.TOR_FULL]: 'Target already has maximum torpedoes incoming.',
  [MessageId.TOR_FMT]: 'Format: tor <target>',

  // missile (feature 006b)
  [MessageId.MIS_NOMIS]: 'No missile launcher mounted.',
  [MessageId.MIS_CLOAK]: 'Cannot fire while cloaked.',
  [MessageId.MIS_NOAMMO]: 'No missiles in cargo.',
  [MessageId.MIS_FULL]: 'Target already has maximum missiles incoming.',
  [MessageId.MIS_FMT]: 'Format: mis <target> <charge>',

  // mine / zipper / decoy / jammer / sys (feature 006b Phase 5)
  [MessageId.MIN_NOMINE]: 'No mine launcher mounted.',
  [MessageId.MIN_CLOAK]: 'Cannot lay mines while cloaked.',
  [MessageId.MIN_NEUTRAL]: 'Cannot lay mines in the neutral zone.',
  [MessageId.MIN_NOAMMO]: 'No mines in cargo.',
  [MessageId.MIN_FULL]: 'Your mine limit is deployed.',
  [MessageId.MIN_DEPLOYED]: 'Mine deployed.',
  [MessageId.ZIP_NOAMMO]: 'No zippers in cargo.',
  [MessageId.ZIP_SWEPT]: 'Mines swept.',
  [MessageId.DEC_NOAMMO]: 'No decoys in cargo.',
  [MessageId.DEC_DEPLOYED]: 'Decoy deployed.',
  [MessageId.JAM_NOAMMO]: 'No jammers in cargo.',
  [MessageId.JAM_FIRED]: 'Jammer deployed.',
  [MessageId.SYS_UNJAM]: 'Jammer cleared.',
  [MessageId.SYS_UNKNOWN]: 'Unknown system command.',
  [MessageId.SYS_FMT]: 'Format: sys <command>',

  // lock (feature 006b Phase 6) — GECMDS.C:1441 cmd_lock
  [MessageId.LOC_SELF]: 'Cannot lock onto yourself.',
  [MessageId.LOC_NOTFOUND]: 'No such ship in range.',
  [MessageId.LOC_LOCKED]: 'Target locked.',
  [MessageId.LOC_FMT]: 'Format: loc <target>',
  [MessageId.NOLOCK]: 'No target locked.',

  // shield (feature 006b Phase 6) — GECMDS.C cmd_shield
  [MessageId.SHI_UP]: 'Shields up.',
  [MessageId.SHI_DN]: 'Shields down.',
  [MessageId.SHI_FMT]: 'Format: shi up|dn',
  // cmd_shields gates, GECMDS.C:3114-3170
  [MessageId.SHIELD0]: 'This ship carries no shield generator.',
  [MessageId.SHLD1]: 'Shields cannot be operated in hyperspace.',
  [MessageId.SHLD2]: 'You have no shields installed.',
  [MessageId.SHNOPWR]: 'Insufficient power to raise shields.',
  [MessageId.SHNORPR]: 'Your shields are damaged and must be repaired first.',

  // flux (feature 006b Phase 6) — GECMDS.C:735-752 cmd_flux
  [MessageId.FLUX_NOPODS]: 'No flux pods in cargo.',
  [MessageId.FLUX_USED]: 'Flux pod used — energy restored.',
  [MessageId.FLUX_FMT]: 'Format: flux',
  /** @see GECMDS.C:748 LASTFLUX — warn when the pod just used was the last one. */
  [MessageId.FLUX_LAST]: 'That was your last flux pod.',

  // who (feature 012) — GECMDS.C:5162 cmd_who reinterpreted
  [MessageId.WHO_HEADER]: '  Shipname               Class                Sector  Kills',
  [MessageId.WHO_ROW]: ' %s %s (%2s,%2s)  %5s',

  // dat (feature 012) — GECMDS.C:5829 cmd_data reinterpreted
  [MessageId.DAT_HEADER]: 'Ship: %s (#%d)',
  [MessageId.DAT_LINE]: '%s',
  [MessageId.DAT_NOT_FOUND]: 'Ship not found.',

  // ros (feature 012) — GECMDS.C:5276 cmd_geroster
  [MessageId.ROS_HEADER]: '  Rank  UserID                Score      Kills  Planets  Population',
  [MessageId.ROS_ROW]: ' %4s  %s %10s  %5s  %5s  %10s',

  // sen (feature 012) — GECMDS.C:1825 cmd_send
  [MessageId.MSG_USAGE_SEN]: 'Usage: sen <A|B|C> <message>',
  [MessageId.MSG_SENT]: 'Message sent on channel %s.',
  [MessageId.FRE_HAIL]: 'Channel %s set to hail.',
  [MessageId.FRE_SECTOR]: 'Channel %s set to %d (sector-scoped).',
  [MessageId.FRE_GALAXY]: 'Channel %s set to %d (galaxy-wide).',

  // fre (feature 012) — GECMDS.C:1885 cmd_freq
  [MessageId.MSG_USAGE_FRE]: 'Usage: fre <A|B|C> <number|hail>',

  // tea (feature 012) — GECMDS.C:5277 cmd_team (subset)
  [MessageId.TEAM_NONE]: 'You are not on a team.',
  [MessageId.TEAM_CURRENT]: 'You are on team %s.',
  [MessageId.TEAM_LEFT]: 'You have left your team.',
  [MessageId.TEAM_JOINED]: 'You have joined team %s.',
  [MessageId.TEAM_NOT_FOUND]: 'No such team: %s',

  // cloak (feature 013) — GECMDS.C:3188 cmd_cloak
  [MessageId.CLOAK_ENGAGED]: 'Cloaking device engaged.',
  [MessageId.CLOAK_ALREADY_ON]: 'Cloaking device already engaged.',
  [MessageId.CLOAK_NO_ENERGY]: 'Insufficient energy to engage cloak.',
  [MessageId.CLOAK_DAMAGED]: 'Cloaking device damaged.',
  [MessageId.CLOAK_HYPERSPACE]: 'Cannot cloak while in hyperspace.',
  [MessageId.CLOAK_DISENGAGED]: 'Cloaking device disengaged.',
  [MessageId.CLOAK_ALREADY_OFF]: 'Cloaking device already down.',
  [MessageId.CLOAK_FMT]: 'Usage: cloak <on|off>',
  [MessageId.CLOAK_SECTOR_DECLOAKED]: '%s has decloaked.',
  [MessageId.CLOAK_COLLAPSED]: 'Emergency decloak — insufficient energy to maintain cloak.',

  // maint (feature 013) — GECMDS.C:4452 cmd_maint
  [MessageId.MAINT_NOT_ORBIT]: 'You must be orbiting a planet to perform maintenance.',
  [MessageId.MAINT_NO_FACILITY]: 'This planet has no maintenance facility.',
  [MessageId.MAINT_COMBAT]: 'Cannot perform maintenance — ship is locked into combat.',
  [MessageId.MAINT_NZ]: 'No maintenance available in the neutral zone except at Zygor.',
  [MessageId.MAINT_NO_DAMAGE]: 'No maintenance is needed.',
  [MessageId.MAINT_NO_CASH]: 'Insufficient funds for maintenance.',
  [MessageId.MAINT_OK]: 'Maintenance complete. Repair queue: %d units.',

  // transfer (feature 013) — GECMDS.C:3271 cmd_transfer reinterpreted
  [MessageId.TRAN_SELF]: 'Cannot transfer to your own ship.',
  [MessageId.TRAN_OFFLINE]: 'Target ship not online.',
  [MessageId.TRAN_SECTOR]: 'Target ship not in this sector.',
  [MessageId.TRAN_NO_CARGO]: 'Insufficient cargo.',
  [MessageId.TRAN_NO_GOLD]: 'Insufficient gold.',
  [MessageId.TRAN_UNKNOWN_ITEM]: 'Usage: transfer <amt> <item|gold> <target-shipno>',
  [MessageId.TRAN_OK]: 'Transferred %d %s to %s.',
  [MessageId.TRAN_RECEIVED]: '%s transferred %d %s to you.',
  [MessageId.TRAN_FMT]: 'Usage: tra down/up <qty> <item>  or  tra <qty> <item> <shipno>',
  [MessageId.TRAN_NOT_ORBIT]: 'You must be in orbit to transfer to a planet.',
  [MessageId.TRAN_NOT_OWNER]: 'You do not own this planet.',
  [MessageId.TRAN_PLANET_LOW]: 'Planet does not have that many.',
  [MessageId.TRAN_DOWN_OK]: 'Transferred %d %s down to %s.',
  [MessageId.TRAN_UP_OK]: 'Transferred %d %s up from %s.',

  // jettison (feature 013) — GECMDS.C:6102 cmd_jettison
  [MessageId.JET_NO_CARGO]: 'Insufficient cargo to jettison.',
  [MessageId.JET_OK]: 'Jettisoned %d %s.',
  [MessageId.JET_FMT]: 'Usage: jettison <amt|ALL> <item>',

  // set (feature 013/015) — GECMDS.C:5190 cmd_set reinterpreted
  [MessageId.SET_OK_ON]: 'Option %s set ON.',
  [MessageId.SET_OK_OFF]: 'Option %s set OFF.',
  [MessageId.SET_UNKNOWN]: 'Unknown option. Usage: set <auto-shield|auto-repair|scannames|scanhome> <on|off>',
  [MessageId.SET_STATUS]: '%s',
  [MessageId.SET_FMT]: 'Usage: set <auto-shield|auto-repair|scannames|scanhome> <on|off>',

  // destruct (feature 013) — GECMDS.C:5025 cmd_destruct
  [MessageId.DESTRUCT_NZ]: 'Cannot self-destruct in the neutral zone.',
  [MessageId.DESTRUCT_ACTIVE]: 'Self-destruct already in progress.',
  [MessageId.DESTRUCT_START]: 'Self-destruct sequence initiated.',
  [MessageId.DESTRUCT_SECTOR_START]: '%s has initiated self-destruct sequence.',
  [MessageId.DESTRUCT_TICK]: '%s: %d ticks until self-destruct.',
  [MessageId.DESTRUCT_TICK_10]: '%s has 10 ticks until self-destruct!',
  [MessageId.DESTRUCT_TICK_5]: '%s has 5 ticks until self-destruct!!',
  [MessageId.DESTRUCT_TICK_2]: '%s has 2 ticks until self-destruct!!!',
  [MessageId.DESTRUCT_BOOM]: '%s has self-destructed!',

  // abort (feature 013) — GECMDS.C:5044 cmd_abort
  [MessageId.ABORT_OK]: 'Self-destruct sequence aborted.',
  [MessageId.ABORT_NONE]: 'No active self-destruct sequence.',
  [MessageId.ABORT_SECTOR]: '%s has aborted self-destruct.',

  // abandon (feature 013) — GECMDS.C:3420 cmd_abandon reinterpreted
  [MessageId.ABANDON_OK]: 'You have abandoned ship %s.',
  [MessageId.ABANDON_SECTOR]: '%s has been abandoned by its captain.',
  [MessageId.ABANDON_NO_SHIP]: 'You have no active ship. Please create one.',
  // canonical `aba` — colony abandonment (GECMDS.C:3420)
  [MessageId.ABAN01]: 'You must be in orbit around a planet to abandon it.',
  [MessageId.ABAN02]: 'You have abandoned %s. It is no longer yours.',
  [MessageId.ABAN03]: 'That planet is not yours to abandon.',

  // nav (feature 016) — GECMDS.C:5120 cmd_navigate
  [MessageId.NAVFMT]: 'Usage: nav <x> <y>',
  // C's cmd_navigate only reports bearing and distance; this port also turns the
  // ship. Neither sets speed, and saying so matters: pilots engaged "autopilot"
  // and sat still waiting to arrive.
  [MessageId.NAV01]: 'Course set for (%s,%s), bearing %s, distance %s. Set speed with war/imp.',
  [MessageId.NAV_INACTIVE]: 'Autopilot inactive.',
  [MessageId.NAV_STATUS]: 'Autopilot active — target (%s,%s), distance %s, bearing %s.',
  [MessageId.NAV_ARRIVED]: 'Autopilot disengaged — arrived at (%s,%s).',
  [MessageId.NAV_ALREADY_THERE]: 'Already at target sector.',

  // spy (feature 016) — GECMDS.C cmd_spy
  [MessageId.SPY1]: 'You must be in orbit of a planet to plant a spy.',
  [MessageId.SPY0]: 'You already own this planet.',
  [MessageId.SPY0B]: 'You cannot plant a spy on a wormhole.',
  [MessageId.SPY0C]: 'Spies cannot operate in the neutral zone.',
  [MessageId.SPYM0]: 'You have no spy equipment aboard.',
  [MessageId.SPYM1]: 'Spy successfully planted on %s.',

  // hel (feature 016) — GECMDS.C cmd_help
  // Topic list is passed in from HELP_TOPIC_IDS — hardcoding it here meant a
  // new topic was reachable but never advertised.
  [MessageId.HELFMT]: "Available help topics: %s. Try 'hel <topic>'.",
  [MessageId.HEL_UNKNOWN]: "Unknown help topic '%s'. Valid topics: %s.",

  // att (feature 014) — GECMDS.C:3515 cmd_attack
  [MessageId.ATT_NOT_ORBIT]: 'You must be orbiting a planet to attack.',
  [MessageId.ATT_NO_CAPABILITY]: 'Your ship class cannot attack planets.',
  [MessageId.ATT_WORMHOLE]: 'You cannot attack a wormhole.',
  [MessageId.ATT_SELF]: 'You cannot attack your own planet.',
  [MessageId.ATT_FORMAT]: 'Usage: att <amount> <troops|fighters>',
  [MessageId.ATT_NO_TROOPS]: 'You do not have enough troops.',
  [MessageId.ATT_NO_FIGHTERS]: 'You do not have enough fighters.',
  [MessageId.ATT_DEFENDER_FIGHTER_KILL]: 'Defender fighters destroyed %d of your troops.',
  [MessageId.ATT_GROUND_TROOP_KILL]: 'Defender ground troops killed %d more.',
  [MessageId.ATT_ATTACKER_COUNTER_KILL]: 'Your forces eliminated %d defenders.',
  [MessageId.ATT_LOSS_REPORT]: 'You lost %d; defenders lost %d.',
  [MessageId.ATT_WIN_TROOP]: 'Your troops have overrun the defenders.',
  [MessageId.ATT_WIN_FIGHTER]: 'You have wiped out the planet\'s defenders.',
  [MessageId.ATT_RETREAT]: 'Your remaining troops surrender to the defenders.',
  [MessageId.ATT_STANDOFF]: 'The attack ends in a standoff.',
  [MessageId.ATT_ITEM_DESTROYED]: '%d %s on the planet were destroyed.',
  [MessageId.ATT_RESOLVED]: 'Attack resolved. %d attackers survive.',
  [MessageId.ATT_OWNER_ALERT]: 'ALERT: %s (%d,%d) is under attack by %s commanded by %s.',
  [MessageId.ATT_GROUND_AA]: 'Ground anti-air shot down %d fighters.',

  // pln (feature 014) — GECMDS.C cmd_pln
  [MessageId.PLN_HEADER]: 'PLANETS  YOU  OWN:',
  [MessageId.PLN_NONE]: 'You do not own any planets.',
  [MessageId.PLN_ROW]: '%-20s  (%2d,%2d)  #%3d',

  // pri (feature 014) — GECMDS.C:4284 cmd_price
  [MessageId.PRICEFMT]: 'Usage: price <qty> <item>  e.g. price 50 missiles  (bare: price lists items)',
  [MessageId.PRICE1]: '%d %s @ %d cr ea = %d cr total',
  [MessageId.PRICE_NO_CASH]: 'Insufficient credits to purchase that quantity.',
  [MessageId.BUY7]: 'This planet has no owner.',
  [MessageId.BUY8]: 'Your cargo hold cannot hold that many.',

  // maint password gate (feature 014) — GECMDS.C:4471 MAINT2, :4479 MAINT3
  [MessageId.MAINT2]: 'This planet requires a password for maintenance.',
  [MessageId.MAINT3]: 'Incorrect maintenance password.',

  // distress mail types (feature 014) — research.md D3
  [MessageId.MESG02]: '%s in sector (%d,%d) was attacked by %d troops from %s (cmdr %s); defenders held.',
  [MessageId.MESG03]: '%s in sector (%d,%d) was overrun by %d troops from %s (cmdr %s); planet lost.',
  [MessageId.MESG04]: '%s in sector (%d,%d) was attacked by %d fighters from %s (cmdr %s); defenders held.',
  [MessageId.MESG05]: '%s in sector (%d,%d) was overrun by %d fighters from %s (cmdr %s); planet lost.',

  // torpedo / missile lock-quality gates (feature 023) — GECMDS.C:1363-1395
  [MessageId.LOCK_FAIL]: 'Cannot get a firing lock — target too distant or evading.',
  [MessageId.LOCK_NEUTRAL]: 'Fire control refuses: target is in the neutral zone.',
  // fire control damaged gate — GECMDS.C:1346-1351 lockon
  [MessageId.FCBROKE]: 'Fire control is damaged — cannot lock.',

  // shared
  [MessageId.HLBROKE]: 'Helm controls are inoperative.',
  [MessageId.NUMOOR]: 'Number out of range (%d-%d).',
  [MessageId.UNKNOWN_CMD]: 'Unknown command. Type "help" for a list.',
  // Blank line — GECMDS.C:282-284 warnop()
  [MessageId.FORHELP]: "Type 'help' for a list of commands.",
  [MessageId.SHIP_ABANDONED]: 'Your ship has been abandoned. Please create a new ship.',
};

/**
 * Formats a message by replacing printf-style placeholders (%s, %d, %u, %.1f) in order.
 *
 * @param id    The message identifier.
 * @param args  Replacement values in left-to-right placeholder order.
 */
export function formatMessage(id: MessageId, ...args: Array<string | number>): string {
  let result = MESSAGE_STRINGS[id];
  let argIdx = 0;
  result = result.replace(/%(?:\d+)?(?:\.\d+)?[suduf]/g, () => {
    const val = args[argIdx++];
    return val !== undefined ? String(val) : '';
  });
  return result.replace(/%%/g, '%');
}
