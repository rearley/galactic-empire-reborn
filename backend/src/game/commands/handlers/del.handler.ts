import { Injectable } from '@nestjs/common';
import { Command, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { MailInboxService } from '../../mail/mail-inbox.service';

/**
 * Handles `del <index>` — hard-deletes one MailStat row identified by 1-based index.
 *
 * Index validation and re-resolution are delegated to MailInboxService.
 * P2025 races (midnight purge) map to "Invalid message." rather than an error.
 *
 * @see GEMAIN.H:220 MAIL_CLASS_*
 * @see GECMDS.C:cmd_deletemail
 * @see specs/017-mail-inbox/contracts/commands.md §del
 */
@Injectable()
export class DelHandlerService {
  constructor(private readonly inbox: MailInboxService) {}

  readonly command: Command = {
    keyword: 'del',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[]): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return { lines: [{ text: 'Usage: del <message-number>', category: 'system' }] };
    }

    const index = Number(args[0]);

    if (!Number.isInteger(index) || index < 1) {
      return { lines: [{ text: 'Invalid message.', category: 'system' }] };
    }

    const deleted = await this.inbox.deleteByIndex(ship.userid, index);

    if (!deleted) {
      return { lines: [{ text: 'Invalid message.', category: 'system' }] };
    }

    return { lines: [{ text: `Message ${index} deleted.`, category: 'success' }] };
  }
}
