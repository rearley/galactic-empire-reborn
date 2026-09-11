import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TeamRepository } from '../../team/team.repository';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

const CARGO_LABELS = [
  'Men', 'Missiles', 'Torpedos', 'Ions', 'FluxPods', 'Food',
  'Fghtrs', 'Decoys', 'Troops', 'Zips', 'Jammers', 'Mines',
  'Gold', 'Spy',
] as const;

/**
 * Handles `dat` — the full stat block for the ship YOU are flying.
 *
 * Canon's cmd_data is a machine-readable dump for a front-end terminal program:
 * gated behind `dat qazwsx <report|scan|sector>`, anything else returning
 * INVCMD, and every field printed from `warsptr`/`waruptr` — the CALLER's ship
 * and user record. It has no target argument and touches no other ship.
 *
 * The port recast it as `dat <fragment>`, "a player-facing scouting verb"
 * (spec 012 D1), which returned for ANY ship in the galaxy, at unlimited range,
 * silently and with no notice to the target: exact sector, heading, speed,
 * energy, damage, kills and the full cargo manifest including gold. Canon has
 * no way to learn another ship's cargo at all — `spy` is planet-only,
 * orbit-only and consumes an I_SPY item. It also matched on `!cloak` rather
 * than `cloak < 10`, so a ship spinning up its cloak stayed exposed, and it did
 * not exclude AI. Reported from play.
 *
 * The readable format stays — nothing in a browser parses canon's `UD1:`
 * protocol lines — but the subject is the caller, as it always was. What a
 * pilot may learn about someone else's ship is what `sca sh` shows.
 *
 * @see GECMDS.C:5829 cmd_data
 * @see docs/DECISIONS.md 2026-09-09
 */
@Injectable()
export class DatHandlerService {
  constructor(
    private readonly shipService: ShipStateService,
    private readonly prisma: PrismaService,
    /**
     * The team repository, `@Optional()` with a default built over the same
     * client this class already holds, so the suite's direct
     * `new DatHandlerService(...)` sites keep compiling and keep asserting on
     * the same `prisma.team.findFirst` call, now made through it.
     * `TeamRepository` is stateless and constructible from `(prisma)` alone.
     */
    @Optional()
    private readonly teams: TeamRepository = new TeamRepository(prisma),
  ) {}

  get command(): Command {
    return {
      keyword: 'dat',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    // A pilot who types `dat <someone>` is asking a question the game answers
    // with `sca sh`, so say so rather than failing silently — the argument form
    // worked for a while and people will have it in their fingers.
    if (args.some((a) => a.trim() !== '')) {
      return {
        lines: [{
          text: 'dat reports your own ship. To look at another, use `sca sh <name>`.',
          category: 'system',
        }],
      };
    }

    const target = ship;

    // Resolve team name and score via the team repository (single call covers both)
    let teamname = '—';
    if (target.teamcode != null) {
      const team = await this.teams.findNameByCode(target.teamcode);
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
