import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamRepository } from './team.repository';
import { ShipState } from '../ship/ship-state.types';
import {
  TeamAdminError,
  TeamCreateError,
  TeamJoinError,
  TeamListEntry,
  MAX_TEAM_PASSWORD_LENGTH,
  MAX_TEAMNAME_LENGTH,
  MIN_TEAMNAME_LENGTH,
  TEAM_LIST_DISPLAY_CAP,
} from './team.types';
import { validatePassword } from './team-name';
import { TEAM_KICK_MAIL_TOPIC } from './team-messages';
import { TEAMMAX } from '../constants';

/**
 * Class stamped on the "you were kicked" notice.
 *
 * Canon never assigns `mail.class` on this path — `cmd_team`'s kick branch does
 * `clrprf(); prfmsg(TEAMKYOU,...); strcpy(mail.topic,...); sendit();` and
 * inherits whatever class the previous mail left behind (GECMDS.C:5648-5655).
 * So the port has to pick one. MAIL_CLASS_MAXOUT is the only canon class with
 * no other producer here, which keeps the notice out of the distress-signal and
 * production-report render paths that would mis-describe it.
 *
 * @see GEMAIN.H:221 #define MAIL_CLASS_MAXOUT 2
 */
const TEAM_KICK_MAIL_CLASS = 2;

/** Founder-password alphabet — no I/O/0/1, which get misread off a screen. */
const SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SECRET_LENGTH = 8;

interface CreateArgs {
  ship: ShipState;
  name: string;
  password: string;
}

interface CreateSuccess {
  ok: true;
  teamcode: bigint;
  teamname: string;
  /** Founder password, shown to the creator once. */
  secret: string;
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

    const secret = TeamService.generateSecret();

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const teamcode = await this.prisma.$transaction(async () => {
          const max = await this.repo.getMaxTeamcode();
          const code = max + 1n;
          await this.repo.insertTeam({ teamcode: code, teamname: name, password, secret });
          await this.prisma.user.update({
            where: { userid: ship.userid },
            data: { teamcode: code },
          });
          return code;
        });

        ship.teamcode = teamcode;
        ship.dirty = true;

        return { ok: true, teamcode, teamname: name, secret };
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

  // ───────────────────────────────────────────────────────────────────────────
  // Founder-gated administration: members / kick / newpass / newname
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `team members` — the userids currently sharing this player's teamcode.
   *
   * C walks the user btrieve file by teamcode and stops after `team_max` names
   * (GECMDS.C:5565-5606); the cap is reproduced here so a team that somehow
   * overfilled still prints a bounded list.
   *
   * @see GECMDS.C:5565
   */
  async membersOf(ship: ShipState): Promise<{ ok: true; teamname: string; members: string[] } | { error: 'not_on_team' }> {
    const team = await this.currentTeam(ship);
    if (!team) return { error: 'not_on_team' };

    const rows = await this.prisma.user.findMany({
      where: { teamcode: team.teamcode },
      select: { userid: true },
      orderBy: { userid: 'asc' },
      take: TEAMMAX,
    });

    return { ok: true, teamname: team.teamname, members: rows.map((r) => r.userid) };
  }

  /**
   * `team kick <founder password> <userid>` — remove a member and mail them.
   *
   * Order of checks follows C exactly: team → founder password → userid exists
   * → userid is on THIS team (GECMDS.C:5614-5680).
   *
   * @see GECMDS.C:5614
   */
  async kick(args: { ship: ShipState; secret: string; userid: string }): Promise<
    { ok: true; userid: string; teamname: string } | TeamAdminError
  > {
    const gate = await this.founderTeam(args.ship, args.secret);
    if ('error' in gate) return gate;
    const { team } = gate;

    const target = await this.prisma.user.findUnique({
      where: { userid: args.userid },
      select: { userid: true, teamcode: true },
    });
    if (!target) return { error: 'user_not_found' };
    if (target.teamcode !== team.teamcode) return { error: 'not_on_your_team' };

    await this.prisma.user.update({
      where: { userid: target.userid },
      data: { teamcode: null },
    });

    // TEAMKYOU. The body text ("...revoked by X") has no payload shape in the
    // inbox renderer, so the team name rides in name1 and the kicker in dtime,
    // which is what `rea` resolves the sender from.
    // @see GECMDS.C:5650
    await this.prisma.mailStat.create({
      data: {
        userid: target.userid,
        class: TEAM_KICK_MAIL_CLASS,
        msgno: this.nextMsgno(),
        type: 0,
        stamp: Math.floor(Date.now() / 1000),
        dtime: args.ship.userid,
        topic: TEAM_KICK_MAIL_TOPIC,
        name1: team.teamname.slice(0, 25),
        itemqty: [],
      },
    });

    return { ok: true, userid: target.userid, teamname: team.teamname };
  }

  /**
   * `team newpass <founder password> <new join password>`.
   * @see GECMDS.C:5682
   */
  async newPassword(args: { ship: ShipState; secret: string; password: string }): Promise<
    { ok: true; password: string } | TeamAdminError
  > {
    const gate = await this.founderTeam(args.ship, args.secret);
    if ('error' in gate) return gate;

    // `newpass` is the ONE path where canon refuses a long password rather
    // than truncating: `if (strlen(margv[3]) > 10) { badfmt(TEAMBPSS); return; }`
    // (GECMDS.C:5702-5706). Team CREATE truncates instead —
    // `strncpy(tmp.password, margv[4], 10)` (:5518). That inconsistency is the
    // original's, and it is reproduced rather than smoothed over.
    if (args.password.length > MAX_TEAM_PASSWORD_LENGTH) return { error: 'password_too_long' };
    const pwError = validatePassword(args.password);
    if (pwError) return { error: pwError };

    await this.prisma.team.update({
      where: { teamcode: gate.team.teamcode },
      data: { password: args.password },
    });

    return { ok: true, password: args.password };
  }

  /**
   * `team newname <founder password> <new name>`.
   *
   * C enforces the 5-character floor (GECMDS.C:5745) but never re-checks the
   * name against the other teams, so `newname` could duplicate a name that
   * `start` would have refused at GECMDS.C:5536. That is an oversight, not a
   * design choice — the two verbs write the same field — so the uniqueness
   * check applies here too, enforced by the `LOWER(teamname)` unique index.
   *
   * @see GECMDS.C:5724
   */
  async newName(args: { ship: ShipState; secret: string; name: string }): Promise<
    { ok: true; teamname: string } | TeamAdminError
  > {
    const gate = await this.founderTeam(args.ship, args.secret);
    if ('error' in gate) return gate;

    // Canon checks only the LOWER bound and then TRUNCATES:
    // `if (strlen(margv[3]) < 5) { badfmt(TEAMBNAM); return; }` followed by
    // `strncpy(teamtab[i].teamname, margv[3], 30)` (GECMDS.C:5745-5751).
    // Refusing a long name was a port invention that turned a valid command
    // into an error.
    const name = args.name.trim().slice(0, MAX_TEAMNAME_LENGTH);
    if (name.length < MIN_TEAMNAME_LENGTH) return { error: 'name_too_short' };

    try {
      await this.prisma.team.update({
        where: { teamcode: gate.team.teamcode },
        data: { teamname: name },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') return { error: 'name_taken' };
      throw err;
    }

    return { ok: true, teamname: name };
  }

  /** The player's live team row, or null when they are on none. */
  private async currentTeam(
    ship: ShipState,
  ): Promise<{ teamcode: bigint; teamname: string; secret: string } | null> {
    if (ship.teamcode == null || ship.teamcode === 0n) return null;
    return this.prisma.team.findFirst({
      where: { teamcode: ship.teamcode, removed: false },
      select: { teamcode: true, teamname: true, secret: true },
    });
  }

  /**
   * Team lookup plus founder-password check, shared by kick/newpass/newname.
   * C runs both in the same order and answers TEAMNOT before TEAMBDSC.
   * @see GECMDS.C:5674 TEAMBDSC  @see GECMDS.C:5679 TEAMNOT
   */
  private async founderTeam(
    ship: ShipState,
    secret: string,
  ): Promise<{ team: { teamcode: bigint; teamname: string; secret: string } } | TeamAdminError> {
    const team = await this.currentTeam(ship);
    if (!team) return { error: 'not_on_team' };
    // A team created before founder passwords existed stores '' — no typed
    // string can match it, and blank must never be a skeleton key.
    if (team.secret.length === 0 || team.secret !== secret) return { error: 'bad_secret' };
    return { team };
  }

  /** Monotonic message number; mirrors PlanetEconomyService's collision guard. */
  private lastMsgno = 0n;

  private nextMsgno(): bigint {
    const now = BigInt(Date.now());
    this.lastMsgno = now > this.lastMsgno ? now : this.lastMsgno + 1n;
    return this.lastMsgno;
  }

  /** Founder password handed out at team creation. @see GECMDS.C:5559 TEAMCRT */
  private static generateSecret(): string {
    let out = '';
    for (let i = 0; i < SECRET_LENGTH; i++) {
      out += SECRET_ALPHABET[Math.floor(Math.random() * SECRET_ALPHABET.length)];
    }
    return out;
  }
}
