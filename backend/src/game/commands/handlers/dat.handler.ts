import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

const CARGO_LABELS = [
  'Men', 'Missiles', 'Torpedos', 'Ions', 'FluxPods', 'Food',
  'Fghtrs', 'Decoys', 'Troops', 'Zips', 'Jammers', 'Mines',
  'Gold', 'Spy',
] as const;

/**
 * Handles `dat <fragment>` — shows full public stat block for a named ship.
 * Reinterpretation of cmd_data (GECMDS.C:5829) as a player-facing scouting verb.
 * @see GECMDS.C:5829 cmd_data
 * @see specs/012-social-commands/research.md D1
 */
@Injectable()
export class DatHandlerService {
  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
  ) {}

  get command(): Command {
    return {
      keyword: 'dat',
      aliases: [],
      minArgs: 1,
      argMissingMessage: 'Usage: dat <ship-name-fragment>',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(_ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const fragment = args[0].toLowerCase();
    const notFound: CommandResult = { lines: [{ text: 'Ship not found.', category: 'system' }] };

    const target = this.shipService
      .findAllShips()
      .find((s) => !s.cloak && s.shipname.toLowerCase().includes(fragment));

    if (!target) return notFound;

    // Resolve team name and score via Prisma (single call covers both)
    let teamname = '—';
    if (target.teamcode != null) {
      const team = await this.prisma.team.findFirst({
        where: { teamcode: target.teamcode },
        select: { teamname: true },
      });
      if (team) teamname = team.teamname;
    }

    const xs = Math.floor(target.xcoord);
    const ys = Math.floor(target.ycoord);
    const lines: CommandResult['lines'] = [];

    lines.push({ text: `Ship: ${target.shipname} (#${target.shipno})`, category: 'info' });
    lines.push({ text: `Class: ${target.shpclass}    Team: ${teamname}`, category: 'info' });
    lines.push({ text: `Sector: (${xs},${ys})    Heading: ${target.heading}    Speed: ${target.speed}`, category: 'info' });
    lines.push({ text: `Energy: ${target.energy}    Damage: ${target.damage}    Kills: ${target.kills}`, category: 'info' });
    lines.push({ text: 'Cargo:', category: 'info' });

    // Items layout: 3 pairs per line, matching the contracts/commands.md spec
    const items = target.items.length >= 14 ? target.items : [...target.items, ...Array(14).fill(0n)].slice(0, 14);
    lines.push({
      text: `  Men:    ${items[0]}    Missiles: ${items[1]}    Torpedos: ${items[2]}`,
      category: 'info',
    });
    lines.push({
      text: `  Ions:   ${items[3]}    FluxPods: ${items[4]}    Food:     ${items[5]}`,
      category: 'info',
    });
    lines.push({
      text: `  Fghtrs: ${items[6]}    Decoys:   ${items[7]}    Troops:   ${items[8]}`,
      category: 'info',
    });
    lines.push({
      text: `  Zips:   ${items[9]}    Jammers:  ${items[10]}   Mines:    ${items[11]}`,
      category: 'info',
    });
    lines.push({
      text: `  Gold:   ${items[12]}   Spy:      ${items[13]}`,
      category: 'info',
    });

    return { lines };
  }
}

// Keep CARGO_LABELS for potential future use in serialization
void CARGO_LABELS;
