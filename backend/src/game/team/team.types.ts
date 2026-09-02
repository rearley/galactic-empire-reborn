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
export const MAX_TEAM_PASSWORD_LENGTH = 8;
export const MAXTEAMS = 50;
export const TEAM_LIST_DISPLAY_CAP = 20;
