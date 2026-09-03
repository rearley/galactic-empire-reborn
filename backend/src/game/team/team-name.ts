import { ParsedTeaArgs, MAX_TEAMNAME_LENGTH, MAX_TEAM_PASSWORD_LENGTH } from './team.types';

/**
 * Splits args into name (all tokens except last, trimmed) and password (last token).
 * Requires at least 2 tokens.
 * @see GECMDS.C:5277 cmd_team
 */
export function parseTeaArgs(args: string[]): ParsedTeaArgs | { error: 'usage' } {
  if (args.length < 2) {
    return { error: 'usage' };
  }
  // strncpy TRUNCATES — it never refuses. `strncpy(tmp.password, margv[4], 10)`
  // and `strncpy(tmp.teamname, margv[5], 30)` (GECMDS.C:5518-5521), against
  // `password[11]` / `teamname[31]` (GEMAIN.H:647-650).
  const password = args[args.length - 1].slice(0, MAX_TEAM_PASSWORD_LENGTH);
  const name = args.slice(0, args.length - 1).join(' ').trim().slice(0, MAX_TEAMNAME_LENGTH);
  if (!name) {
    return { error: 'usage' };
  }
  return { name, password };
}

/**
 * Kept as a seam, but there is nothing left to reject.
 *
 * Canon never refuses a team name for length — `strncpy(..., 30)` truncates
 * (GECMDS.C:5521, :5750) — and `parseTeaArgs` now does the truncation, so a
 * name reaching here is already within the field. The port's old refusal
 * turned a command a 1994 player could type into an error.
 *
 * @see GECMDS.C:5517-5521, GEMAIN.H:647
 */
export function validateName(_name: string): 'name_too_long' | null {
  return null;
}

/**
 * Validates team password: non-blank, ≤ MAX_TEAM_PASSWORD_LENGTH chars, no whitespace.
 * @see GECMDS.C:5277 cmd_team
 */
export function validatePassword(pw: string): 'password_too_long' | 'password_has_space' | null {
  // No length refusal: canon truncates at 10 (GECMDS.C:5518) and parseTeaArgs
  // has already done so. The whitespace guard stays — canon tokenises on
  // whitespace so it cannot be typed there, but our input path can carry it.
  if (/\s/.test(pw)) {
    return 'password_has_space';
  }
  return null;
}
