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
  REP24A = 'REP24A',
  REP23 = 'REP23',
  REP24 = 'REP24',
  REP12 = 'REP12',
  REP13 = 'REP13',

  // scan
  SCANFMT = 'SCANFMT',
  TABROKE = 'TABROKE',
  JAMMER4 = 'JAMMER4',

  // scan pl — planet status block (feature 004)
  // @see specs/004-galaxy-generator/contracts/scan-projection.md §"Message catalogue additions"
  NO_SUCH_PLANET = 'NO_SUCH_PLANET',
  SCAN08 = 'SCAN08',
  SCAN_DASHES = 'SCAN_DASHES',
  SCAN09 = 'SCAN09',
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

  // torpedo (feature 006b) — GECMDS.C:cmd_torpedo
  TOR_NOTOR = 'TOR_NOTOR',
  TOR_WARP = 'TOR_WARP',
  TOR_CLOAK = 'TOR_CLOAK',
  TOR_NOAMMO = 'TOR_NOAMMO',
  TOR_FULL = 'TOR_FULL',
  TOR_FMT = 'TOR_FMT',

  // missile (feature 006b) — GECMDS.C:cmd_missl
  MIS_NOMIS = 'MIS_NOMIS',
  MIS_NOAMMO = 'MIS_NOAMMO',
  MIS_FULL = 'MIS_FULL',
  MIS_FMT = 'MIS_FMT',

  // mine / zipper / decoy / jammer / sys (feature 006b Phase 5)
  MIN_NOAMMO = 'MIN_NOAMMO',
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

  // flux (feature 006b Phase 6) — GECMDS.C:735-752 cmd_flux
  FLUX_NOPODS = 'FLUX_NOPODS',
  FLUX_USED = 'FLUX_USED',
  FLUX_FMT = 'FLUX_FMT',

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

  // shared
  HLBROKE = 'HLBROKE',
  NUMOOR = 'NUMOOR',
  UNKNOWN_CMD = 'UNKNOWN_CMD',
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
  [MessageId.REPFMT]: 'Usage: report <nav|sys|cargo|wpns>',
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
  [MessageId.REP24A]: 'Frequencies: %d / %d / %d.',
  [MessageId.REP23]: 'Phasors: %s.',
  [MessageId.REP24]: 'Phasors: none.',
  [MessageId.REP12]: 'Cloak: active.',
  [MessageId.REP13]: 'Cloak: inactive.',

  // scan — GECMDS.C:2138
  [MessageId.SCANFMT]: 'Usage: scan <sh|pl|ra|se|lo>',
  [MessageId.TABROKE]: 'Tactical computer is offline.',
  [MessageId.JAMMER4]: 'Cannot scan while jammer is active.',

  // scan pl — planet status block (feature 004)
  // @see GECMDS.C:2316 (no-planet path); GECMDS.C:2326-2356 (planet status block)
  [MessageId.NO_SUCH_PLANET]: 'No planet by that name.',
  [MessageId.SCAN08]: 'Planet #%d: %s',
  [MessageId.SCAN_DASHES]: '-----------------',
  [MessageId.SCAN09]: 'Owned by: %s',
  [MessageId.SCAN10]: 'Bearing: %d   Distance: %s',
  [MessageId.SCAN11]: 'Environment: ',
  [MessageId.SCAN12]: 'Earth-like',
  [MessageId.SCAN13]: 'Hostile',
  [MessageId.SCAN14]: 'Toxic',
  [MessageId.SCAN15]: 'Inferno-like',
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
  [MessageId.LAND_OK]: 'You have landed on %s.',
  [MessageId.LAND_REFUSED]: 'Landing refused — this planet is closed.',
  [MessageId.LAND_PASSFAIL]: 'Landing refused — incorrect password.',

  // buy (feature 005) — GECMDS.C:4201 cmd_buy
  [MessageId.BUYFMT]: 'Use: buy <quantity> <item>',
  [MessageId.BUY1]: 'You must be landed on a planet to buy goods.',
  [MessageId.BUY2]: '%d %s purchased for %d credits.',
  [MessageId.BUY3]: "That would deplete the planet's reserve.",
  [MessageId.BUY4]: 'Your cargo holds are full.',
  [MessageId.BUY5]: 'This planet is not selling that item.',
  [MessageId.BUYPAS1]: 'Trade password required.',
  [MessageId.BUYPAS3]: 'This planet trades only with its team.',
  [MessageId.BUYPAS4]: 'Welcome, fellow team-mate.',

  // sell (feature 005) — GECMDS.C:4103 cmd_sell
  [MessageId.SELLFMT]: 'Use: sell <quantity> <item>',
  [MessageId.SELL1]: 'You can only sell at the galactic market on Zygor-3.',
  [MessageId.SELL2]: 'Sold %d %s for %d credits (fee %d).',
  [MessageId.SELL3]: "You don't have that many %s.",

  // admin (feature 005) — GECMDS.C:3462 cmd_admin
  [MessageId.ADM_NOT_LANDED]: 'You must be landed on your planet to administer it.',
  [MessageId.ADM_NOT_OWNER]: 'You are not the owner of this planet.',
  [MessageId.ADM_MENU]: 'Admin options: rate, markup, sellflag, reserve, tax, beacon, password',
  [MessageId.ADM_INVALID]: 'Invalid value.',
  [MessageId.ADM_OK]: 'Setting saved.',

  // withdraw (feature 005)
  [MessageId.WTHDR_NOT_LANDED]: 'You must be landed on your planet to withdraw taxes.',
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
  [MessageId.PHA_FMT]: 'Format: pha <bearing> <percent>',

  // torpedo (feature 006b)
  [MessageId.TOR_NOTOR]: 'No torpedo launcher mounted.',
  [MessageId.TOR_WARP]: 'Cannot fire torpedoes at warp speed.',
  [MessageId.TOR_CLOAK]: 'Cannot fire while cloaked.',
  [MessageId.TOR_NOAMMO]: 'No torpedoes in cargo.',
  [MessageId.TOR_FULL]: 'Target already has maximum torpedoes incoming.',
  [MessageId.TOR_FMT]: 'Format: tor <target>',

  // missile (feature 006b)
  [MessageId.MIS_NOMIS]: 'No missile launcher mounted.',
  [MessageId.MIS_NOAMMO]: 'No missiles in cargo.',
  [MessageId.MIS_FULL]: 'Target already has maximum missiles incoming.',
  [MessageId.MIS_FMT]: 'Format: mis <target> <charge>',

  // mine / zipper / decoy / jammer / sys (feature 006b Phase 5)
  [MessageId.MIN_NOAMMO]: 'No mines in cargo.',
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

  // flux (feature 006b Phase 6) — GECMDS.C:735-752 cmd_flux
  [MessageId.FLUX_NOPODS]: 'No flux pods in cargo.',
  [MessageId.FLUX_USED]: 'Flux pod used — energy restored.',
  [MessageId.FLUX_FMT]: 'Format: flux',

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

  // shared
  [MessageId.HLBROKE]: 'Helm controls are inoperative.',
  [MessageId.NUMOOR]: 'Number out of range (%d-%d).',
  [MessageId.UNKNOWN_CMD]: 'Unknown command. Type "help" for a list.',
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
  return result;
}
