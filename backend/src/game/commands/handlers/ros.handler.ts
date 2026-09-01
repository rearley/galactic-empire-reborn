import { formatPopulation } from './ros-format';
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
      // C lists only players who have actually scored — `tmpusr.score > 0`
      // (GECMDS.C:4038). Without it every dormant and never-flown account
      // padded the board, which is what filled the roster with e2e_* rows on
      // the shared development database.
      where: {
        score: { gt: 0n },
        AND: [
          { NOT: { userid: { startsWith: 'Cybrg-' } } },
          { NOT: { userid: { startsWith: '@Droid-' } } },
          { NOT: { userid: { startsWith: '@' } } },
        ],
      },
      orderBy: [{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }],
      take: limit,
      select: { userid: true, username: true, score: true, kills: true, planets: true, population: true, teamcode: true },
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

    // Show the player's NAME, not the internal identifier. C prints `userid`
    // (GEFUNCS.C:2603 username()), but in MajorBBS the userid WAS the player's
    // handle. This port splits it into a synthetic `usr_<hex>` userid and a
    // human `username`, so printing userid is literally faithful yet useless —
    // the roster read `usr_a9070dc745a8688f` for every row.
    const header =
      ` ${'Rank'.padStart(4)}  ${'Name'.padEnd(20)} ${'Team'.padEnd(12)} ${'Score'.padStart(10)}  ${'Kills'.padStart(5)}  ${'Planets'.padStart(7)}  ${'Population'.padStart(10)}`;
    const lines: CommandResult['lines'] = [{ text: header, category: 'system' }];

    rows.forEach((row, idx) => {
      const rank = (idx + 1).toString().padStart(4);
      const userid = (row.username ?? row.userid).padEnd(20).slice(0, 20);
      const teamname = (row.teamcode != null && row.teamcode !== 0n)
        ? (teamMap.get(row.teamcode.toString()) ?? null)
        : null;
      const team = renderTeamCell(teamname);
      const score = row.score.toString().padStart(10);
      const kills = row.kills.toString().padStart(5);
      const planets = row.planets.toString().padStart(7);
      // `" %8.3fm"` of population/100 — the counter is hundredths of a
      // million, not a headcount. @see GECMDS.C:4043
      const pop = formatPopulation(row.population);
      lines.push({ text: ` ${rank}  ${userid} ${team} ${score}  ${kills}  ${planets}  ${pop}`, category: 'info' });
    });

    return { lines };
  }
}
