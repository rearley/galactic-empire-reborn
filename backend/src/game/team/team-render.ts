import { TeamListEntry } from './team.types';
import { CommandResult } from '../commands/command.types';

const HEADER = '  Rank  Team                            Members  Score';

/** Renders `tea list` output. Returns a "No teams" line when empty. */
export function renderTeamList(entries: TeamListEntry[]): CommandResult['lines'] {
  if (entries.length === 0) {
    return [{ text: 'No teams have been formed.', category: 'info' }];
  }

  const lines: CommandResult['lines'] = [{ text: HEADER, category: 'system' }];
  for (const e of entries) {
    const rank = e.rank.toString().padStart(4);
    const name = e.teamname.padEnd(30).slice(0, 30);
    const members = e.members.toString().padStart(5);
    const score = e.score.toString().padStart(10);
    lines.push({ text: `  ${rank}  ${name}  ${members}  ${score}`, category: 'info' });
  }
  return lines;
}

/**
 * Renders the 12-char fixed-width team column for `ros`.
 * D6: truncate at 11 chars + ellipsis; `---` for unaffiliated.
 */
export function renderTeamCell(teamname: string | null): string {
  if (!teamname) {
    return '---'.padEnd(12);
  }
  if (teamname.length <= 12) {
    return teamname.padEnd(12);
  }
  return teamname.slice(0, 11) + '…';
}
