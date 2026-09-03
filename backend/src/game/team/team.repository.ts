import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A team midnight disbanded for having no members is gone as far as C is
   * concerned — its `teamtab` slot was freed — so its name must not resolve
   * here, or it stays joinable with its old password.
   * @see GECMDS.C:5277 cmd_team  @see GEMAIN.C:1293
   */
  async findByNameLower(name: string): Promise<{ teamcode: bigint; teamname: string; password: string } | null> {
    return this.prisma.team.findFirst({
      where: { teamname: { equals: name, mode: 'insensitive' }, removed: false },
      select: { teamcode: true, teamname: true, password: true },
    });
  }

  /** @see GECMDS.C:5277 cmd_team */
  async insertTeam(data: {
    teamcode: bigint;
    teamname: string;
    password: string;
    secret: string;
  }): Promise<void> {
    await this.prisma.team.create({
      data: {
        teamcode: data.teamcode,
        teamname: data.teamname,
        password: data.password,
        teamcount: 1,
        teamscore: 0n,
        secret: data.secret,
        flag: 0,
      },
    });
  }

  /** Returns live member counts grouped by teamcode. @see GECMDS.C:5277 cmd_team */
  async liveCountsGroupBy(): Promise<Array<{ teamcode: bigint; count: number }>> {
    const rows = await this.prisma.user.groupBy({
      by: ['teamcode'],
      where: { teamcode: { gt: 0n } },
      _count: { _all: true },
    });
    return rows
      .filter((r) => r.teamcode != null)
      .map((r) => ({ teamcode: r.teamcode as bigint, count: r._count._all }));
  }

  /** Batch-fetches teams by their codes to avoid N+1. @see GECMDS.C:5277 cmd_team */
  async findTeamsByCodes(codes: bigint[]): Promise<Array<{ teamcode: bigint; teamname: string; teamscore: bigint }>> {
    if (codes.length === 0) return [];
    return this.prisma.team.findMany({
      where: { teamcode: { in: codes } },
      select: { teamcode: true, teamname: true, teamscore: true },
    });
  }

  /** Returns the highest teamcode in use, or 0n if no teams exist. @see GECMDS.C:5277 cmd_team */
  async getMaxTeamcode(): Promise<bigint> {
    const result = await this.prisma.team.aggregate({ _max: { teamcode: true } });
    return result._max.teamcode ?? 0n;
  }
}
