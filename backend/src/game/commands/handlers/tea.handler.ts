import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles `tea [<name>|leave]` — shows, joins, or leaves a team.
 * On join/leave: writes User.teamcode via Prisma, mirrors into ShipState,
 * and triggers a player.snapshot rebroadcast.
 * @see GECMDS.C:5277 cmd_team (subset — join/leave/show only)
 * @see specs/012-social-commands/research.md D2
 */
@Injectable()
export class TeaHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipService: ShipStateService,
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
    const arg = args[0]?.toLowerCase();

    if (!arg) {
      return this.showTeam(ship);
    }

    if (arg === 'leave') {
      return this.leaveTeam(ship);
    }

    return this.joinTeam(ship, args[0]);
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

  private async joinTeam(ship: ShipState, rawName: string): Promise<CommandResult> {
    const team = await this.prisma.team.findFirst({
      where: { teamname: { equals: rawName, mode: 'insensitive' } },
      select: { teamcode: true, teamname: true },
    });

    if (!team) {
      return { lines: [{ text: `No such team: ${rawName}`, category: 'system' }] };
    }

    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { teamcode: team.teamcode },
    });
    ship.teamcode = team.teamcode;
    ship.dirty = true;

    return {
      lines: [{ text: `You have joined team ${team.teamname}.`, category: 'success' }],
      broadcasts: [{ room: '__player_snapshot__', event: 'player.snapshot', payload: {} }],
    };
  }
}
