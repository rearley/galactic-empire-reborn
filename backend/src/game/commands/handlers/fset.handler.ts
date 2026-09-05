import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { FKEY_SLOTS, parseFsetArgs } from '../fkeys';

/**
 * `fset f1 pha 0 0` — bind a function key. `fset f1` clears it. `fset` lists.
 *
 * PORT-ORIGINAL: canon kept function keys in the TERMINAL (people bound them
 * in Telix or Qmodem to transmit "pha 0 0\r"), so GECMDS.C has no key handling
 * to be faithful to. Typed rather than captured because a browser cannot
 * reliably claim F-keys — F11 and F12 never reach the page.
 *
 * Named `fset` so the 3-character dispatcher cannot confuse it with canon's
 * `set` (GECMDS.C:1892) or with `flu`.
 *
 * Bindings live on the USER, not the ship, so they follow a captain across
 * hulls — which matters now `x` makes switching ships routine.
 *
 * @see src/game/commands/fkeys.ts
 * @see docs/DECISIONS.md
 */
@Injectable()
export class FsetHandlerService {
  constructor(private readonly prisma: PrismaService) {}

  readonly command: Command = {
    keyword: 'fset',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private list(ship: ShipState): CommandResult {
    const bindings = ship.fkeys ?? [];
    const bound = bindings
      .map((cmd, i) => ({ cmd, n: i + 1 }))
      .filter((b) => b.cmd !== '');

    if (bound.length === 0) {
      return {
        lines: [{ text: 'No function keys bound. Try: fset f1 pha 0 0', category: 'system' }],
      };
    }
    return {
      lines: [
        { text: 'Function keys:', category: 'system' },
        ...bound.map((b) => ({ text: `  f${b.n}  ${b.cmd}`, category: 'info' as const })),
      ],
    };
  }

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (args.length === 0) return this.list(ship);

    const parsed = parseFsetArgs(args);
    if (!parsed.ok) {
      return {
        lines: [{
          text: `Usage: fset f1-f${FKEY_SLOTS} <command>   (fset f1 with no command clears it)`,
          category: 'system',
        }],
      };
    }

    // Read-modify-write the whole array: Prisma has no element update for a
    // scalar list, and the slot may be past the current end.
    const bindings = [...(ship.fkeys ?? [])];
    while (bindings.length < FKEY_SLOTS) bindings.push('');
    bindings[parsed.slot] = parsed.command;

    await this.prisma.user.update({
      where: { userid: ship.userid },
      data: { fkeys: bindings },
    });
    ship.fkeys = bindings;

    const n = parsed.slot + 1;
    return {
      lines: [{
        text: parsed.command === ''
          ? `f${n} cleared.`
          : `f${n} set to "${parsed.command}".`,
        category: 'success',
      }],
      fkeys: bindings,
    };
  }
}
