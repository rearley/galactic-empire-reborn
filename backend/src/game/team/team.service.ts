import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamRepository } from './team.repository';
import { ShipState } from '../ship/ship-state.types';
import { TeamCreateError, TeamJoinError, TeamListEntry, TEAM_LIST_DISPLAY_CAP } from './team.types';
import { TEAMMAX } from '../constants';

interface CreateArgs {
  ship: ShipState;
  name: string;
  password: string;
}

interface CreateSuccess {
  ok: true;
  teamcode: bigint;
  teamname: string;
}

interface JoinSuccess {
  ok: true;
  teamname: string;
}

/**
 * Handles team create, password-gated join, and list operations.
 * @see GECMDS.C:5277 cmd_team
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TeamRepository,
  ) {}

  /**
   * Creates a new team and assigns the ship's owner as first member.
   * Retries up to 3 times on P2002 (unique name collision race).
   * @see GECMDS.C:5277 cmd_team
   */
  async create(args: CreateArgs): Promise<CreateSuccess | TeamCreateError> {
    const { ship, name, password } = args;

    if (ship.teamcode != null && ship.teamcode !== 0n) {
      return { error: 'already_on_team' };
    }

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const teamcode = await this.prisma.$transaction(async () => {
          const max = await this.repo.getMaxTeamcode();
          const code = max + 1n;
          await this.repo.insertTeam({ teamcode: code, teamname: name, password });
          await this.prisma.user.update({
            where: { userid: ship.userid },
            data: { teamcode: code },
          });
          return code;
        });

        ship.teamcode = teamcode;
        ship.dirty = true;

        return { ok: true, teamcode, teamname: name };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === 'P2002' && attempts < 3) {
          continue;
        }
        if (code === 'P2002') {
          return { error: 'name_taken' };
        }
        throw err;
      }
    }

    return { error: 'name_taken' };
  }

  /**
   * Joins an existing team after verifying the password (case-sensitive).
   * Name match is case-insensitive.
   * @see GECMDS.C:5277 cmd_team
   */
  async joinByPassword(args: { ship: ShipState; name: string; password: string }): Promise<JoinSuccess | TeamJoinError> {
    const { ship, name, password } = args;

    if (ship.teamcode != null && ship.teamcode !== 0n) {
      return { error: 'already_on_team' };
    }

    const team = await this.repo.findByNameLower(name);
    if (!team) {
      return { error: 'no_such_team' };
    }

    if (team.password !== password) {
      return { error: 'wrong_password' };
    }

    // Team size cap. C refuses the join outright when the team is already at
    // team_max (GECMDS.C:5357). Counted live from the user table rather than
    // read off Team.teamcount, because that column is only recomputed by the
    // midnight job and would let a team overfill within a single day.
    //
    // Counting and joining must be ATOMIC. Read-then-write is a time-of-check /
    // time-of-use race: two pilots joining the last slot concurrently both read
    // TEAMMAX-1 and both succeed, putting the team over its cap -- which is the
    // whole thing the cap exists to prevent, since the midnight job pays
    // TEAMBONU per member. The original could not hit this (a BBS ran one
    // session at a time); a websocket server can.
    //
    // The team row is locked FOR UPDATE first, so concurrent joins to the SAME
    // team serialise behind it while joins to different teams stay parallel.
    const joined = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT teamcode FROM "Team" WHERE teamcode = ${team.teamcode} FOR UPDATE`;

      const members = await tx.user.count({ where: { teamcode: team.teamcode } });
      if (members >= TEAMMAX) return false;

      await tx.user.update({
        where: { userid: ship.userid },
        data: { teamcode: team.teamcode },
      });
      return true;
    });

    if (!joined) {
      return { error: 'team_full', limit: TEAMMAX };
    }

    ship.teamcode = team.teamcode;
    ship.dirty = true;

    return { ok: true, teamname: team.teamname };
  }

  /**
   * Returns a live-counted, sorted leaderboard of non-empty teams (cap: TEAM_LIST_DISPLAY_CAP).
   * Uses exactly two Prisma queries — no N+1.
   * @see GECMDS.C:5277 cmd_team
   */
  async list(): Promise<TeamListEntry[]> {
    const counts = await this.repo.liveCountsGroupBy();
    const liveCounts = counts.filter((c) => c.count > 0);
    if (liveCounts.length === 0) return [];

    const codes = liveCounts.map((c) => c.teamcode);
    const teams = await this.repo.findTeamsByCodes(codes);

    const countMap = new Map(liveCounts.map((c) => [c.teamcode.toString(), c.count]));

    const entries = teams
      .map((t) => ({
        teamcode: t.teamcode,
        teamname: t.teamname,
        score: t.teamscore,
        members: countMap.get(t.teamcode.toString()) ?? 0,
      }))
      .filter((e) => e.members > 0)
      .sort((a, b) => {
        const scoreDiff = Number(b.score - a.score);
        if (scoreDiff !== 0) return scoreDiff;
        return a.teamcode < b.teamcode ? -1 : a.teamcode > b.teamcode ? 1 : 0;
      })
      .slice(0, TEAM_LIST_DISPLAY_CAP);

    return entries.map((e, i) => ({
      rank: i + 1,
      teamcode: e.teamcode,
      teamname: e.teamname,
      members: e.members,
      score: e.score,
    }));
  }
}
