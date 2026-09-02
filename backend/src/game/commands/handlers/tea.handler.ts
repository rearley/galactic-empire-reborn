import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { TeamService } from '../../team/team.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { parseTeaArgs, validateName, validatePassword } from '../../team/team-name';
import { renderTeamList } from '../../team/team-render';

/**
 * Handles `tea [create|list|<name> <pw>|leave]` — full team management.
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

    if (arg0 === 'leave') {
      return this.leaveTeam(ship);
    }

    if (arg0 === 'list') {
      return this.listTeams();
    }

    if (arg0 === 'create') {
      return this.createTeam(ship, args.slice(1));
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
      lines: [{ text: `Team ${result.teamname} created. You are its first member.`, category: 'success' }],
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
}
