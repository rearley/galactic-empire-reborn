import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TeamRepository } from '../../team/team.repository';
import { renderTeamCell } from '../../team/team-render';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

const ROSTER_ALL_CAP = 200;
const ROSTER_MAX_DEFAULT = 20;

/**
 * Handles `ros [all]` — leaderboard sorted by score, AI excluded.
 * Reads User rows directly via Prisma; default cap from ROSTER_MAX env var.
 * Team column added via a single batched TeamRepository.findTeamsByCodes call (no N+1).
 * @see GECMDS.C:5276 cmd_geroster
 */
@Injectable()
export class RosHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamRepo: TeamRepository,
  ) {}

  get command(): Command {
    return {
      keyword: 'ros',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: (_ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(args, ctx),
    };
  }

  private async handle(args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const showAll = args[0]?.toLowerCase() === 'all';
    const rosterMax = parseInt(process.env['ROSTER_MAX'] ?? '', 10);
    const limit = showAll ? ROSTER_ALL_CAP : (Number.isFinite(rosterMax) ? rosterMax : ROSTER_MAX_DEFAULT);

    const allRows = await this.prisma.user.findMany({
      where: {
        AND: [
          { NOT: { userid: { startsWith: 'Cybrg-' } } },
          { NOT: { userid: { startsWith: '@Droid-' } } },
        ],
      },
      orderBy: [{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }],
      take: limit,
      select: { userid: true, score: true, kills: true, planets: true, population: true, teamcode: true },
    });
    const rows = allRows.slice(0, limit);

    // Batch-fetch teams for all non-zero/non-null teamcodes — one query, no N+1
    const teamcodes = [...new Set(
      rows
        .filter((r) => r.teamcode != null && r.teamcode !== 0n)
        .map((r) => r.teamcode as bigint),
    )];
    const teamRows = await this.teamRepo.findTeamsByCodes(teamcodes);
    const teamMap = new Map(teamRows.map((t) => [t.teamcode.toString(), t.teamname]));

    const header = '  Rank  UserID                Team         Score      Kills  Planets  Population';
    const lines: CommandResult['lines'] = [{ text: header, category: 'system' }];

    rows.forEach((row, idx) => {
      const rank = (idx + 1).toString().padStart(4);
      const userid = row.userid.padEnd(20).slice(0, 20);
      const teamname = (row.teamcode != null && row.teamcode !== 0n)
        ? (teamMap.get(row.teamcode.toString()) ?? null)
        : null;
      const team = renderTeamCell(teamname);
      const score = row.score.toString().padStart(10);
      const kills = row.kills.toString().padStart(5);
      const planets = row.planets.toString().padStart(5);
      const pop = row.population.toString().padStart(10);
      lines.push({ text: ` ${rank}  ${userid} ${team} ${score}  ${kills}  ${planets}  ${pop}`, category: 'info' });
    });

    return { lines };
  }
}
