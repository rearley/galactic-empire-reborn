import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

const ROSTER_ALL_CAP = 200;
const ROSTER_MAX_DEFAULT = 20;

/**
 * Handles `ros [all]` — leaderboard sorted by score, AI excluded.
 * Reads User rows directly via Prisma; default cap from ROSTER_MAX env var.
 * @see GECMDS.C:5276 cmd_geroster
 */
@Injectable()
export class RosHandlerService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: { userid: true, score: true, kills: true, planets: true, population: true },
    });
    const rows = allRows.slice(0, limit);

    const header = '  Rank  UserID                Score      Kills  Planets  Population';
    const lines: CommandResult['lines'] = [{ text: header, category: 'system' }];

    rows.forEach((row, idx) => {
      const rank = (idx + 1).toString().padStart(4);
      const userid = row.userid.padEnd(20).slice(0, 20);
      const score = row.score.toString().padStart(10);
      const kills = row.kills.toString().padStart(5);
      const planets = row.planets.toString().padStart(5);
      const pop = row.population.toString().padStart(10);
      lines.push({ text: ` ${rank}  ${userid} ${score}  ${kills}  ${planets}  ${pop}`, category: 'info' });
    });

    return { lines };
  }
}
