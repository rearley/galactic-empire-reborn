/**
 * Returns true when a userid belongs to an AI ship (Cybertron or Droid).
 *
 * Cybertron userids: /^Cybrg-/ — see GECYBS.C userid generation
 * Droid userids: /^@Droid-/ — see constants.ts DROID_USERID_PREFIX
 *
 * Used by `ros` to exclude AI rows from the leaderboard, and by combat score
 * accounting to identify AI victims.
 *
 * @see backend/src/game/game/constants.ts DROID_USERID_PREFIX
 * @see backend/src/game/cybertron/cybertron-tick.service.ts userid generation
 */
export function isAiUserid(userid: string): boolean {
  return userid.startsWith('Cybrg-') || userid.startsWith('@Droid-');
}
