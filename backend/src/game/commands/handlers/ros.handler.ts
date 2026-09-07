import { formatPopulation } from './ros-format';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { formatMessage, MessageId } from '../messages';
import { MAXLIST } from '../../constants';
import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../../player/roster-query';

/** `ros all` — `j = 200` (GECMDS.C:4024). */
const ROSTER_ALL_CAP = 200;

/**
 * Handles `ros [all]` — leaderboard sorted by score, AI excluded.
 * Reads User rows directly via Prisma; the cap is the MAXLIST sysop option.
 * Canon's roster has no Team column, so no team lookup is needed.
 * @see GECMDS.C:5276 cmd_geroster
 */
@Injectable()
export class RosHandlerService {
  constructor(
    private readonly prisma: PrismaService,
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
    // `j = gemaxlist`, and `ros all` raises it to 200 (GECMDS.C:4020-4024).
    // The limit was an env var defaulting to 20; MAXLIST is the canon option
    // for exactly this and its canon default is 10, so the port was showing
    // twice the board canon does and calling the option unimplemented.
    const showAll = args[0]?.toLowerCase() === 'all';
    const limit = showAll ? ROSTER_ALL_CAP : MAXLIST;

    const allRows = await this.prisma.user.findMany({
      // C lists only players who have actually scored — `tmpusr.score > 0`
      // (GECMDS.C:4038). Without it every dormant and never-flown account
      // padded the board, which is what filled the roster with e2e_* rows on
      // the shared development database.
      where: ROSTER_WHERE,
      orderBy: ROSTER_ORDER_BY,
      take: limit,
      select: { userid: true, username: true, score: true, kills: true, planets: true, population: true },
    });
    const rows = allRows.slice(0, limit);

    // ROSTER2 is the wide-terminal heading and takes the list length, so the
    // "Top %d" line cannot disagree with what follows (GECMDS.C:4028).
    const lines: CommandResult['lines'] = [
      { text: formatMessage(MessageId.ROS_HEADER, limit), category: 'system' },
    ];

    rows.forEach((row) => {
      // prf("%-30s%s%5d%3d%s\r", userid, score, kills, planets, population)
      // — GECMDS.C:4045, with score pre-rendered as "%11ld" and population as
      // " %8.3fm". No Rank column and no Team column: canon has neither, and
      // the board is ordered, so the rank was the row's own position.
      lines.push({
        text: formatMessage(
          MessageId.ROS_ROW,
          (row.username ?? row.userid).slice(0, 30),
          row.score.toString().padStart(11),
          row.kills,
          row.planets,
          formatPopulation(row.population),
        ),
        category: 'info',
      });
    });

    return { lines };
  }
}
