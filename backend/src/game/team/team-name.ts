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
  const password = args[args.length - 1];
  const name = args.slice(0, args.length - 1).join(' ').trim();
  if (!name) {
    return { error: 'usage' };
  }
  return { name, password };
}

/**
 * Validates team name: non-blank, ≤ MAX_TEAMNAME_LENGTH chars.
 * @see GECMDS.C:5277 cmd_team
 */
export function validateName(name: string): 'name_too_long' | null {
  if (name.length > MAX_TEAMNAME_LENGTH) {
    return 'name_too_long';
  }
  return null;
}

/**
 * Validates team password: non-blank, ≤ MAX_TEAM_PASSWORD_LENGTH chars, no whitespace.
 * @see GECMDS.C:5277 cmd_team
 */
export function validatePassword(pw: string): 'password_too_long' | 'password_has_space' | null {
  if (pw.length > MAX_TEAM_PASSWORD_LENGTH) {
    return 'password_too_long';
  }
  if (/\s/.test(pw)) {
    return 'password_has_space';
  }
  return null;
}
