/**
 * Who the sysop is.
 *
 * Canon reads sysop status from the MajorBBS user record's `ISYSOP` flag
 * GECMDS.C:4754 `if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP)))`.
 *
 * Canon actually ships that check twice, either side of an `#ifdef PHARLAP`:
 * the PharLap build asks `hasmkey(SYSKEY)` at :4752 and everything else reads
 * the ISYSOP flag at :4754. Both mean "the BBS says this person is staff",
 * which is the thing this port has no equivalent of.
 * This port has no such record, so identity comes from the GE_SYSOP_USERNAME
 * allowlist — port-original plumbing for a canon gate.
 *
 * Extracted from `sys.handler.ts` when the reports page needed the same
 * question answered over HTTP. Two copies of an authorization check is how one
 * of them quietly stops matching the other.
 *
 * Empty or unset means NOBODY is a sysop, which is the safe default in both
 * callers: an ungated `sys unjam` is a free universal counter to the jammer,
 * and an ungated reports feed is every player's bug report, including whatever
 * they pasted into it.
 *
 * Matches on USERNAME, not `userid`: `userid` is
 * `usr_${randomBytes(12).toString('hex')}`, minted at registration, so it
 * cannot be configured before the account exists and differs after every
 * database reset. The username is chosen by the operator and survives one.
 * Case-insensitive, because `User.username` is case-insensitively unique.
 */
export function isSysopUsername(
  username: string | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const name = username?.trim().toLowerCase();
  if (!name) return false;
  return (env['GE_SYSOP_USERNAME'] ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u.length > 0)
    .includes(name);
}
