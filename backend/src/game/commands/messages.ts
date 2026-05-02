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
  result = result.replace(/%(?:\.\d+)?[suduf]/g, () => {
    const val = args[argIdx++];
    return val !== undefined ? String(val) : '';
  });
  return result;
}
