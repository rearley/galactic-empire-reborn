import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { TeamService } from '../../team/team.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { parseTeaArgs, validateName, validatePassword } from '../../team/team-name';
import { renderTeamList } from '../../team/team-render';
import { TeamAdminError } from '../../team/team.types';
import {
  TEAMBDSC,
  TEAMBNAM,
  TEAMBPSS,
  TEAMEXST,
  TEAMFMT,
  TEAMMHDR,
  TEAMNFND,
  TEAMNOT,
  TEAMNTM,
  teamCreatedFounderBlock,
  teamKicked,
  teamNewName,
  teamNewPassword,
} from '../../team/team-messages';

/**
 * Handles the `tea` sub-verbs.
 *
 * Canon's `cmd_team` accepts join / score / unjoin / start / members / kick /
 * newpass / newname, plus a `dumpitout` debug verb (GECMDS.C:5299, 5384, 5431,
 * 5471, 5565, 5614, 5682, 5724, 5766). All but `dumpitout` are implemented;
 * see docs/DECISIONS.md for why that one is not, and for the port's `create` /
 * `list` / `leave` spellings, which are kept as aliases of `start` / `score` /
 * `unjoin`.
 * On join/leave/create: writes User.teamcode via Prisma, mirrors into ShipState,
 * and triggers a player.snapshot rebroadcast.
 * @see GECMDS.C:5277 cmd_team
 * @see specs/012-social-commands/research.md D2
 */
@Injectable()
export class TeaHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipService: ShipStateService,
    private readonly teamService: TeamService,
  ) {}

  get command(): Command {
    return {
      keyword: 'tea',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const arg0 = args[0]?.toLowerCase();

    if (!arg0) {
      return this.showTeam(ship);
    }

    // `unjoin` is the canon spelling (GECMDS.C:5431); `leave` is this port's.
    if (arg0 === 'leave' || arg0 === 'unjoin') {
      return this.leaveTeam(ship);
    }

    // `score` is the canon spelling (GECMDS.C:5384).
    if (arg0 === 'list' || arg0 === 'score') {
      return this.listTeams();
    }

    // `start` is the canon spelling (GECMDS.C:5471).
    if (arg0 === 'create' || arg0 === 'start') {
      return this.createTeam(ship, args.slice(1));
    }

    // Canon requires the `join` keyword (GECMDS.C:5299); this port also accepts
    // the bare `tea <name> <pw>` form below.
    if (arg0 === 'join') {
      return this.joinTeam(ship, args.slice(1));
    }

    if (arg0 === 'members') {
      return this.showMembers(ship);
    }

    if (arg0 === 'kick') {
      return this.kickMember(ship, args.slice(1));
    }

    if (arg0 === 'newpass') {
      return this.changePassword(ship, args.slice(1));
    }

    if (arg0 === 'newname') {
      return this.changeName(ship, args.slice(1));
    }

    // args.length === 1 → single non-keyword token → show current team (FR-016a)
    if (args.length === 1) {
      return this.showTeam(ship);
    }

    // args.length >= 2 → password-gated join
    return this.joinTeam(ship, args);
  }

  private async showTeam(ship: ShipState): Promise<CommandResult> {
    if (ship.teamcode == null) {
      return { lines: [{ text: 'You are not on a team.', category: 'info' }] };
    }
    const team = await this.prisma.team.findFirst({
      where: { teamcode: ship.teamcode },
      select: { teamname: true },
    });
    const name = team?.teamname ?? ship.teamcode.toString();
    return { lines: [{ text: `You are on team ${name}.`, category: 'info' }] };
  }

  private async leaveTeam(ship: ShipState): Promise<CommandResult> {
    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { teamcode: null },
    });
    ship.teamcode = undefined;
    ship.dirty = true;

    return {
      lines: [{ text: 'You have left your team.', category: 'success' }],
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }

  private async listTeams(): Promise<CommandResult> {
    const entries = await this.teamService.list();
    return { lines: renderTeamList(entries) };
  }

  private async createTeam(ship: ShipState, createArgs: string[]): Promise<CommandResult> {
    const parsed = parseTeaArgs(createArgs);
    if ('error' in parsed) {
      return { lines: [{ text: 'Usage: tea create <name> <password>', category: 'system' }] };
    }

    const nameError = validateName(parsed.name);
    if (nameError === 'name_too_long') {
      return { lines: [{ text: 'Team name must be 30 characters or fewer.', category: 'system' }] };
    }

    const pwError = validatePassword(parsed.password);
    if (pwError === 'password_too_long') {
      return { lines: [{ text: 'Team password must be 8 characters or fewer.', category: 'system' }] };
    }
    if (pwError === 'password_has_space') {
      return { lines: [{ text: 'Team password may not contain spaces.', category: 'system' }] };
    }

    const result = await this.teamService.create({ ship, name: parsed.name, password: parsed.password });

    if ('error' in result) {
      return { lines: [{ text: this.createErrorMessage(result.error), category: 'system' }] };
    }

    return {
      lines: [
        { text: `Team ${result.teamname} created. You are its first member.`, category: 'success' as const },
        ...teamCreatedFounderBlock(result.secret).map((text) => ({ text, category: 'system' as const })),
      ],
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }

  private createErrorMessage(error: string): string {
    switch (error) {
      case 'already_on_team': return "You are already on a team. Use 'tea leave' first.";
      case 'name_too_long': return 'Team name must be 30 characters or fewer.';
      case 'password_too_long': return 'Team password must be 8 characters or fewer.';
      case 'password_has_space': return 'Team password may not contain spaces.';
      case 'name_taken': return 'Team name already taken.';
      default: return 'Usage: tea create <name> <password>';
    }
  }

  private async joinTeam(ship: ShipState, args: string[]): Promise<CommandResult> {
    const parsed = parseTeaArgs(args);
    if ('error' in parsed) {
      return { lines: [{ text: "You are already on a team. Use 'tea leave' first.", category: 'system' }] };
    }

    const result = await this.teamService.joinByPassword({ ship, name: parsed.name, password: parsed.password });

    if ('error' in result) {
      switch (result.error) {
        case 'already_on_team':
          return { lines: [{ text: "You are already on a team. Use 'tea leave' first.", category: 'system' }] };
        case 'no_such_team':
          return { lines: [{ text: `No such team: ${parsed.name}`, category: 'system' }] };
        case 'wrong_password':
          return { lines: [{ text: 'Wrong password.', category: 'system' }] };
        case 'team_full':
          return {
            lines: [{
              text: `That team is full (${result.limit} members maximum).`,
              category: 'system',
            }],
          };
      }
    }

    return {
      lines: [{ text: `You have joined team ${result.teamname}.`, category: 'success' }],
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }

  // ── Founder-gated sub-verbs (GECMDS.C:5565/5614/5682/5724) ────────────────

  /** `tea members` @see GECMDS.C:5565 */
  private async showMembers(ship: ShipState): Promise<CommandResult> {
    const result = await this.teamService.membersOf(ship);
    if ('error' in result) {
      return { lines: [{ text: TEAMNOT, category: 'system' }] };
    }
    return {
      lines: [
        { text: TEAMMHDR, category: 'system' },
        { text: result.members.join(', '), category: 'info' },
      ],
    };
  }

  /** `tea kick <founder password> <userid>` @see GECMDS.C:5614 */
  private async kickMember(ship: ShipState, rest: string[]): Promise<CommandResult> {
    if (rest.length < 2) {
      return { lines: [{ text: TEAMFMT, category: 'system' }] };
    }

    const result = await this.teamService.kick({ ship, secret: rest[0], userid: rest[1] });
    if ('error' in result) {
      return { lines: [{ text: this.adminErrorMessage(result), category: 'system' }] };
    }

    // The kicked pilot may be flying right now; in-memory ShipState is the
    // source of truth during play, so the DB write alone would leave them on
    // the team until their next login.
    for (const target of this.shipService.findByUserid(result.userid)) {
      target.teamcode = undefined;
      target.dirty = true;
    }

    return {
      lines: teamKicked(result.userid).map((text) => ({ text, category: 'success' as const })),
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }

  /** `tea newpass <founder password> <new password>` @see GECMDS.C:5682 */
  private async changePassword(ship: ShipState, rest: string[]): Promise<CommandResult> {
    if (rest.length < 2) {
      return { lines: [{ text: TEAMFMT, category: 'system' }] };
    }

    const result = await this.teamService.newPassword({ ship, secret: rest[0], password: rest[1] });
    if ('error' in result) {
      return { lines: [{ text: this.adminErrorMessage(result), category: 'system' }] };
    }

    return { lines: [{ text: teamNewPassword(result.password), category: 'success' }] };
  }

  /** `tea newname <founder password> <new name>` @see GECMDS.C:5724 */
  private async changeName(ship: ShipState, rest: string[]): Promise<CommandResult> {
    if (rest.length < 2) {
      return { lines: [{ text: TEAMFMT, category: 'system' }] };
    }

    // C `rstrin()`s the tail so the name may contain spaces (GECMDS.C:5744).
    const name = rest.slice(1).join(' ');
    const result = await this.teamService.newName({ ship, secret: rest[0], name });
    if ('error' in result) {
      return { lines: [{ text: this.adminErrorMessage(result), category: 'system' }] };
    }

    return {
      lines: [{ text: teamNewName(result.teamname), category: 'success' }],
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }

  private adminErrorMessage(err: TeamAdminError): string {
    switch (err.error) {
      case 'not_on_team': return TEAMNOT;
      case 'bad_secret': return TEAMBDSC;
      case 'user_not_found': return TEAMNFND;
      case 'not_on_your_team': return TEAMNTM;
      case 'password_too_long': return TEAMBPSS;
      case 'password_has_space': return 'Team password may not contain spaces.';
      case 'name_too_short': return TEAMBNAM;
      case 'name_too_long': return 'Team name must be 30 characters or fewer.';
      case 'name_taken': return TEAMEXST;
    }
  }
}
