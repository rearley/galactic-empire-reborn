import { Injectable } from '@nestjs/common';
import { Command, CommandResult } from '../command.types';
import { ShipState } from '../../ship/ship-state.types';
import { MailInboxService } from '../../mail/mail-inbox.service';
import { formatDetail } from '../../mail/mail-render';

/**
 * Handles `rea <index>` — renders the class-specific detail view for one message.
 * Read-only: no MailStat rows are modified (FR-013).
 *
 * @see GEMAIN.H:220 MAIL_CLASS_* — class constants
 * @see GECMDS.C:cmd_readmail
 * @see specs/017-mail-inbox/contracts/commands.md §rea
 */
@Injectable()
export class ReaHandlerService {
  constructor(private readonly inbox: MailInboxService) {}

  readonly command: Command = {
    keyword: 'rea',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[]): Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return { lines: [{ text: 'Usage: rea <message-number>', category: 'system' }] };
    }

    const index = Number(args[0]);
    const entry = await this.inbox.resolveIndex(ship.userid, index);

    if (!entry) {
      return { lines: [{ text: 'Invalid message.', category: 'system' }] };
    }

    return { lines: formatDetail(entry).map((text) => ({ text, category: 'info' as const })) };
  }
}
