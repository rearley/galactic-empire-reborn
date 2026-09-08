import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { RenameService } from '../../onboarding/rename.service';

/**
 * Handles `rename <name>` — lets a bound player rename their ship.
 * Validation and DB+memory update are delegated to RenameService.
 * On success the handler returns a `broadcasts` array so the gateway
 * can emit `ship.renamed` to the sector room and refresh `player.snapshot`.
 *
 * @see GECMDS.C:5002 cmd_rename
 */
@Injectable()
export class RenameHandlerService {
  constructor(private readonly renameService: RenameService) {}

  get command(): Command {
    return {
      keyword: 'rename',
      // canon's own keyword (GECMDS.C cmdtab). Shipping only the long form
      // made the command untypeable by the name the original uses.
      aliases: ['ren'],
      minArgs: 1,
      argMissingMessage: 'Usage: rename <new-name>',
      handler: (
        ship: ShipState,
        args: string[],
        ctx: CommandContext,
      ): Promise<CommandResult> => this.handle(ship, args, ctx),
    };
  }

  private async handle(
    ship: ShipState,
    args: string[],
    _ctx: CommandContext,
  ): Promise<CommandResult> {
    // args casing is preserved since CommandRouterService only lower-cases the keyword
    const newName = args[0];

    const result = await this.renameService.rename(ship.userid, ship.shipno, newName);

    if (!result.ok) {
      const text =
        result.reason === 'NAME_TAKEN'
          ? `Name "${newName}" is already taken.`
          : `Invalid ship name. Use 1-19 printable characters (no spaces).`;
      return { lines: [{ text, category: 'system' }] };
    }

    // Byte-identical rename — silent no-op
    if (result.oldName === result.newName) {
      return {
        lines: [{ text: `Ship name unchanged: ${result.newName}`, category: 'system' }],
      };
    }

    const x = Math.floor(ship.xcoord);
    const y = Math.floor(ship.ycoord);
    const sectorRoom = `sector:${x}:${y}`;

    return {
      lines: [
        {
          text: `Ship renamed: ${result.oldName} → ${result.newName}`,
          category: 'success',
        },
      ],
      broadcasts: [
        {
          room: sectorRoom,
          event: 'ship.renamed',
          payload: {
            shipId: result.shipId,
            oldName: result.oldName,
            newName: result.newName,
          },
        },
        {
          // Sentinel: gateway resolves this to a global player.snapshot emit
          room: '__player_snapshot__',
          event: 'player.snapshot',
          payload: {},
        },
      ],
    };
  }
}
