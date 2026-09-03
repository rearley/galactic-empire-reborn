export interface ParsedTeaArgs {
  name: string;
  password: string;
}

export interface TeamListEntry {
  rank: number;
  teamcode: bigint;
  teamname: string;
  members: number;
  score: bigint;
}

export type TeamCreateError =
  | { error: 'already_on_team' }
  | { error: 'usage' }
  | { error: 'name_too_long' }
  | { error: 'password_too_long' }
  | { error: 'password_has_space' }
  | { error: 'name_taken' };

export type TeamJoinError =
  | { error: 'already_on_team' }
  | { error: 'no_such_team' }
  | { error: 'wrong_password' }
  | { error: 'team_full'; limit: number };

export const MAX_TEAMNAME_LENGTH = 30;
// GEMAIN.H:650 `char password[11]` — ten characters plus the NUL, and
// GECMDS.C:5518 fills it with `strncpy(tmp.password, margv[4], 10)`. The port
// capped it at 8, so a password a 1994 player could set was refused here.
export const MAX_TEAM_PASSWORD_LENGTH = 10;
export const MAXTEAMS = 50;
export const TEAM_LIST_DISPLAY_CAP = 20;

/** Minimum length `team newname` accepts. @see GECMDS.C:5745 */
export const MIN_TEAMNAME_LENGTH = 5;

/**
 * Errors shared by the founder-gated sub-verbs (`kick`, `newpass`, `newname`).
 * @see GECMDS.C:5614 / :5682 / :5724
 */
export type TeamAdminError =
  | { error: 'not_on_team' }
  | { error: 'bad_secret' }
  | { error: 'user_not_found' }
  | { error: 'not_on_your_team' }
  | { error: 'password_too_long' }
  | { error: 'password_has_space' }
  | { error: 'name_too_short' }
  | { error: 'name_too_long' }
  | { error: 'name_taken' };
