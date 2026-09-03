/**
 * Canon `cmd_team` message text, transcribed from the shipped message file.
 *
 * These live here rather than in `messages.ts` so the team sub-verbs own their
 * own strings; `scan.handler.ts`'s local `SCANWRM` is the same pattern.
 *
 * Source of truth is `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG` (the
 * shipped release copy). The `GE/MSG/` copy is an earlier partial snapshot and
 * must not be used.
 *
 * @see GECMDS.C:5277 cmd_team
 */

import { MAX_TEAM_PASSWORD_LENGTH } from './team.types';

/** @see GE/REL/MBMGEMSG.MSG:5862 TEAMEXST */
export const TEAMEXST = 'That team name or team code already exists...choose another.';

/** @see GE/REL/MBMGEMSG.MSG:5907 TEAMBDSC */
export const TEAMBDSC = 'Sorry, that is not the valid Founders Password.';

/** @see GE/REL/MBMGEMSG.MSG:5911 TEAMNOT */
export const TEAMNOT = "You don't seem to currently be a member of a valid team, Sorry!";

/** @see GE/REL/MBMGEMSG.MSG:5915 TEAMNFND */
export const TEAMNFND = 'That Userid does not seem to be currently in the game.';

/** @see GE/REL/MBMGEMSG.MSG:5920 TEAMNTM */
export const TEAMNTM = 'That Userid is not currently on your team.';

/** @see GE/REL/MBMGEMSG.MSG:5952 TEAMMHDR */
export const TEAMMHDR = 'The members of your team are...';

/** @see GE/REL/MBMGEMSG.MSG:6151 TEAMFMT */
export const TEAMFMT = 'Type HELP TEAM for the correct usage.';

/** @see GE/REL/MBMGEMSG.MSG:5944 TEAMBNAM */
export const TEAMBNAM = 'The team name must be at least 5 characters long.';

/**
 * @see GE/REL/MBMGEMSG.MSG:5935 TEAMBPSS
 *
 * Two departures from the shipped string, both deliberate:
 *  - "loo long" is a typo in the original data file; corrected to "too long".
 *  - The original says 10 characters. This port caps team passwords at
 *    `MAX_TEAM_PASSWORD_LENGTH` (8) per the 2026-05-08 decision, so the number
 *    is interpolated rather than hard-coded — a message that named a limit the
 *    code does not enforce would be worse than either.
 */
export const TEAMBPSS =
  `That password is too long - please shorten it to ${MAX_TEAM_PASSWORD_LENGTH} characters or less.`;

/** @see GE/REL/MBMGEMSG.MSG:5939 TEAMNPSS */
export const teamNewPassword = (password: string): string =>
  `The team password has been changed to "${password}".`;

/** @see GE/REL/MBMGEMSG.MSG:5948 TEAMNNAM */
export const teamNewName = (name: string): string => `The new team name is now "${name}".`;

/** @see GE/REL/MBMGEMSG.MSG:5929 TEAMKICK */
export const teamKicked = (userid: string): string[] => [
  `As you requested ${userid} has been removed from the team and`,
  'sent an email message notifying him/her of this action.',
];

/**
 * The founder-password block appended to `tea create`.
 * Canon prints the whole TEAMCRT block; this port already prints its own
 * creation line, so only the founder half is reproduced.
 * @see GE/REL/MBMGEMSG.MSG:5866 TEAMCRT
 * @see GECMDS.C:5559
 */
export const teamCreatedFounderBlock = (secret: string): string[] => [
  `Founder Password..: ${secret}`,
  '',
  'Please write down the Founder Password as you will not be able to change it',
  'or display it again.',
];

/** Canon topic line on the kick notification. @see GECMDS.C:5652 */
export const TEAM_KICK_MAIL_TOPIC = 'Team Membership Revoked';
