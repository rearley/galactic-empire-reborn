/**
 * How the admin screen describes who may TRADE at a planet.
 *
 * The password gates trading, not landing: it is checked inside the buy path,
 * and C's message ids say as much — BUYPAS3 when a stranger is refused,
 * BUYPAS4 when a team-mate is welcomed (GECMDS.C:4232-4246). Buying requires
 * orbit; `land` is the separate command that claims an unowned world.
 *
 * Calling it "who may land" described a restriction that does not exist —
 * nothing prevents another captain orbiting your colony.
 *
 * @see GEMAIN.C:3024 ADMIN06
 */
export function describeTradeAccess(password: string, teamcode: bigint): string {
  if (teamcode > 0n) return 'your team only';
  if (!password || password.toLowerCase() === 'none') return 'anyone';
  return `password "${password}"`;
}
