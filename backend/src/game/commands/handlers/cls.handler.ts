import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';

/**
 * Handles the `cls` command — clears the issuing player's frontend event log.
 * Pure handler: no backend state mutation, no broadcast. Extra arguments silently ignored.
 * @see GECMDS.C:117 cmd_cls
 */
@Injectable()
export class ClsHandlerService {
  readonly command: Command = {
    keyword: 'cls',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (_ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult => {
      return { lines: [], clearLog: true };
    },
  };
}
