import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { MaintHandlerService } from './maint.handler';

/**
 * Handles `mai` — the canon MAINTENANCE command.
 *
 * The original command table binds the `mai` prefix to cmd_maint and nothing
 * else (GECMDS.C:144 `{"mai", cmd_maint, 1}`); cmd_maint's body is entirely
 * repair (GECMDS.C:4452) and its ONLY optional argv[1] is the planet trade
 * password (GECMDS.C:4469
 * `if (!sameas(plptr->password,"none") && margc < 2)`).
 *
 * This port previously dispatched on argument COUNT — bare `mai` listed mail,
 * any argument repaired — so the argument was a discriminator rather than a
 * password, and a damaged pilot in orbit typing `mai` got a mailbox instead of
 * a repair crew. `mai` now always repairs; the mailbox (a port original with
 * no canon keyword) lives on `rea`.
 *
 * This class remains the `mai` registration seam because `maint` collides with
 * `mai` under the original's 3-character prefix match (GECMDS.C:249 gesearch);
 * the gate logic and messages belong to MaintHandlerService.
 *
 * @see GECMDS.C:144 command table entry
 * @see GECMDS.C:4452 cmd_maint
 */
@Injectable()
export class MaiHandlerService {
  constructor(private readonly maint: MaintHandlerService) {}

  readonly command: Command = {
    keyword: 'mai',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args, ctx),
  };

  /**
   * `mai [password]` — repair at the planet in orbit. args[0], when present,
   * is the planet's trade password (GECMDS.C:4469-4484).
   */
  async handle(ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> {
    return (await this.maint.command.handler(ship, args, ctx)) as CommandResult;
  }
}
